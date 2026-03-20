/**
 * Realtime Collaboration Module — Firestore
 * Handles: presence, cursors, document sync, comments
 */

class RealtimeCollaboration {
    constructor() {
        this.roomId = null;
        this.userId = this._generateId();
        this.nickname = this._loadNickname();
        this.color = this._assignColor();
        this.users = new Map();
        this.comments = [];
        this._unsubscribers = [];

        // Callbacks
        this.onUserJoin = null;
        this.onUserLeave = null;
        this.onCursorMove = null;
        this.onCommentAdd = null;
        this.onCommentUpdate = null;
        this.onUsersUpdate = null;
        this.onDocumentSync = null;
        this.onRoomReady = null;

        this._cursorThrottleTimer = null;
        this._knownUserIds = new Set();
        this._documentLoaded = false;
    }

    // ==================== Room Management ====================

    /**
     * Create a new room and store document data
     */
    async createRoom(documentData, fileName) {
        this.roomId = this._generateRoomId();
        this._documentLoaded = true; // creator already has the doc

        try {
            // Store room metadata
            await db.collection('rooms').doc(this.roomId).set({
                fileName: fileName || 'Untitled',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.userId
            });

            // Store document data — split into chunks if needed
            await this._storeDocument(documentData);

            this._joinRoom();
            this._updateUrl();
            console.log('[Collab] Room created:', this.roomId);
            return this.roomId;
        } catch (err) {
            console.error('[Collab] Room creation failed:', err);
            // Still set roomId for local functionality
            this._joinRoomLocal();
            this._updateUrl();
            return this.roomId;
        }
    }

    /**
     * Join an existing room — listens for document data in real-time
     */
    async joinRoom(roomId) {
        this.roomId = roomId;
        this._documentLoaded = false;

        try {
            const roomDoc = await db.collection('rooms').doc(this.roomId).get();
            if (!roomDoc.exists) {
                throw new Error('존재하지 않는 방입니다');
            }

            const roomData = roomDoc.data();

            // Try to load document immediately
            const loaded = await this._tryLoadDocument(roomData.fileName);

            if (!loaded) {
                // If document not yet uploaded, listen for it
                console.log('[Collab] Document not found yet, waiting for sync...');
                this._listenDocument(roomData.fileName);
            }

            this._joinRoom();
            this._updateUrl();
            return roomData;
        } catch (err) {
            console.error('[Collab] Join room failed:', err);
            throw err;
        }
    }

    /**
     * Try loading document data immediately
     */
    async _tryLoadDocument(fileName) {
        try {
            // Check for single-doc storage
            const docSnap = await db.collection('rooms').doc(this.roomId)
                .collection('data').doc('document').get();

            if (docSnap.exists && docSnap.data().content) {
                const docData = JSON.parse(docSnap.data().content);
                this._documentLoaded = true;
                if (this.onDocumentSync) {
                    this.onDocumentSync(docData, fileName || 'Shared Document');
                }
                return true;
            }

            // Check for chunked storage
            const chunksSnap = await db.collection('rooms').doc(this.roomId)
                .collection('data').doc('document').collection('chunks')
                .orderBy('index').get();

            if (!chunksSnap.empty) {
                let fullContent = '';
                chunksSnap.forEach(chunk => {
                    fullContent += chunk.data().content;
                });
                const docData = JSON.parse(fullContent);
                this._documentLoaded = true;
                if (this.onDocumentSync) {
                    this.onDocumentSync(docData, fileName || 'Shared Document');
                }
                return true;
            }

            return false;
        } catch (err) {
            console.warn('[Collab] Load document failed:', err);
            return false;
        }
    }

    /**
     * Listen for document data (real-time) — for when joining before upload completes
     */
    _listenDocument(fileName) {
        const docRef = db.collection('rooms').doc(this.roomId)
            .collection('data').doc('document');

        const unsub = docRef.onSnapshot(snap => {
            if (this._documentLoaded) return; // already loaded
            if (snap.exists && snap.data().content) {
                try {
                    const docData = JSON.parse(snap.data().content);
                    this._documentLoaded = true;
                    console.log('[Collab] Document received via real-time sync');
                    if (this.onDocumentSync) {
                        this.onDocumentSync(docData, fileName || 'Shared Document');
                    }
                } catch (e) {
                    console.warn('[Collab] Document parse error:', e);
                }
            }
        }, err => {
            console.warn('[Collab] Document listener error:', err);
        });

        this._unsubscribers.push(unsub);
    }

    /**
     * Store document data — splits into chunks if > 800KB
     */
    async _storeDocument(documentData) {
        const content = JSON.stringify(documentData);
        const MAX_CHUNK_SIZE = 800 * 1024; // 800KB per chunk

        if (content.length <= MAX_CHUNK_SIZE) {
            // Single document
            await db.collection('rooms').doc(this.roomId)
                .collection('data').doc('document').set({
                    content: content,
                    size: content.length,
                    chunked: false
                });
        } else {
            // Chunked storage
            const numChunks = Math.ceil(content.length / MAX_CHUNK_SIZE);
            const batch = db.batch();

            // Set metadata
            const docRef = db.collection('rooms').doc(this.roomId)
                .collection('data').doc('document');
            batch.set(docRef, {
                chunked: true,
                numChunks: numChunks,
                totalSize: content.length
            });

            // Store chunks
            for (let i = 0; i < numChunks; i++) {
                const chunkRef = docRef.collection('chunks').doc(`chunk_${i}`);
                batch.set(chunkRef, {
                    index: i,
                    content: content.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE)
                });
            }

            await batch.commit();
            console.log(`[Collab] Document stored in ${numChunks} chunks`);
        }
    }

    /**
     * Internal join — set up presence & listeners
     */
    _joinRoom() {
        if (!this.roomId) return;

        // Set user presence
        const userRef = db.collection('rooms').doc(this.roomId)
            .collection('users').doc(this.userId);

        userRef.set({
            nickname: this.nickname,
            color: this.color,
            cursorX: 0,
            cursorY: 0,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn('[Collab] Presence set failed:', err));

        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            userRef.delete().catch(() => {});
        });

        // Listen for users
        this._listenUsers();
        // Listen for comments
        this._listenComments();

        if (this.onRoomReady) {
            this.onRoomReady(this.roomId);
        }
    }

    /**
     * Local-only join (when Firebase is unavailable)
     */
    _joinRoomLocal() {
        if (this.onRoomReady) {
            this.onRoomReady(this.roomId);
        }
        this._emitUsersUpdate();
    }

    /**
     * Leave the current room
     */
    leaveRoom() {
        if (!this.roomId) return;

        db.collection('rooms').doc(this.roomId)
            .collection('users').doc(this.userId)
            .delete().catch(() => {});

        this._unsubscribers.forEach(unsub => unsub());
        this._unsubscribers = [];

        this.roomId = null;
        this.users.clear();
        this.comments = [];
        this._knownUserIds.clear();
        this._documentLoaded = false;
    }

    // ==================== Presence & Cursors ====================

    updateCursor(x, y) {
        if (!this.roomId) return;
        if (this._cursorThrottleTimer) return;

        this._cursorThrottleTimer = setTimeout(() => {
            this._cursorThrottleTimer = null;
        }, 150);

        db.collection('rooms').doc(this.roomId)
            .collection('users').doc(this.userId)
            .update({
                cursorX: Math.round(x),
                cursorY: Math.round(y),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
    }

    _listenUsers() {
        const usersRef = db.collection('rooms').doc(this.roomId).collection('users');

        const unsub = usersRef.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                const data = change.doc.data();
                const userId = change.doc.id;

                if (change.type === 'added') {
                    if (userId !== this.userId) {
                        this.users.set(userId, { ...data, id: userId });
                        if (!this._knownUserIds.has(userId) && this.onUserJoin) {
                            this.onUserJoin(data);
                        }
                        this._knownUserIds.add(userId);
                    }
                } else if (change.type === 'modified') {
                    if (userId !== this.userId) {
                        this.users.set(userId, { ...data, id: userId });
                        if (this.onCursorMove) {
                            this.onCursorMove({
                                userId,
                                nickname: data.nickname,
                                color: data.color,
                                x: data.cursorX || 0,
                                y: data.cursorY || 0
                            });
                        }
                    }
                } else if (change.type === 'removed') {
                    if (userId !== this.userId) {
                        const user = this.users.get(userId);
                        this.users.delete(userId);
                        this._knownUserIds.delete(userId);
                        if (this.onUserLeave && user) this.onUserLeave(user);
                    }
                }
            });
            this._emitUsersUpdate();
        }, err => {
            console.warn('[Collab] Users listener error:', err);
        });

        this._unsubscribers.push(unsub);
    }

    _emitUsersUpdate() {
        if (!this.onUsersUpdate) return;
        const userList = [
            { id: this.userId, nickname: this.nickname, color: this.color, isMe: true }
        ];
        this.users.forEach(user => {
            userList.push({ ...user, isMe: false });
        });
        this.onUsersUpdate(userList);
    }

    // ==================== Comments ====================

    async addComment(text, x, y) {
        if (!this.roomId) return null;

        const commentData = {
            text,
            x: Math.round(x),
            y: Math.round(y),
            authorId: this.userId,
            authorName: this.nickname,
            authorColor: this.color,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            resolved: false
        };

        try {
            const ref = await db.collection('rooms').doc(this.roomId)
                .collection('comments').add(commentData);
            commentData.id = ref.id;
            return commentData;
        } catch (err) {
            console.error('[Collab] Add comment failed:', err);
            commentData.id = 'local_' + Date.now();
            commentData.timestamp = Date.now();
            this.comments.push(commentData);
            if (this.onCommentAdd) this.onCommentAdd(commentData);
            return commentData;
        }
    }

    async addReply(commentId, text) {
        if (!this.roomId) return;

        const replyData = {
            text,
            authorId: this.userId,
            authorName: this.nickname,
            authorColor: this.color,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('rooms').doc(this.roomId)
                .collection('comments').doc(commentId)
                .collection('replies').add(replyData);
        } catch (err) {
            console.error('[Collab] Reply failed:', err);
        }
    }

    async toggleResolve(commentId) {
        try {
            const ref = db.collection('rooms').doc(this.roomId)
                .collection('comments').doc(commentId);
            const snap = await ref.get();
            if (snap.exists) {
                await ref.update({ resolved: !snap.data().resolved });
            }
        } catch (err) {
            console.error('[Collab] Toggle resolve failed:', err);
        }
    }

    async deleteComment(commentId) {
        if (!this.roomId) return;
        try {
            await db.collection('rooms').doc(this.roomId)
                .collection('comments').doc(commentId).delete();
        } catch (err) {
            console.error('[Collab] Delete comment failed:', err);
        }
    }

    _listenComments() {
        const commentsRef = db.collection('rooms').doc(this.roomId)
            .collection('comments').orderBy('timestamp', 'asc');

        const unsub = commentsRef.onSnapshot(async snapshot => {
            for (const change of snapshot.docChanges()) {
                const data = change.doc.data();
                data.id = change.doc.id;
                if (data.timestamp && data.timestamp.toDate) {
                    data.timestamp = data.timestamp.toDate().getTime();
                }

                // Load replies
                try {
                    const repliesSnap = await db.collection('rooms').doc(this.roomId)
                        .collection('comments').doc(data.id)
                        .collection('replies').orderBy('timestamp', 'asc').get();

                    data.replies = {};
                    repliesSnap.forEach(replyDoc => {
                        const reply = replyDoc.data();
                        reply.id = replyDoc.id;
                        if (reply.timestamp && reply.timestamp.toDate) {
                            reply.timestamp = reply.timestamp.toDate().getTime();
                        }
                        data.replies[reply.id] = reply;
                    });
                } catch(e) {
                    data.replies = {};
                }

                if (change.type === 'added') {
                    const exists = this.comments.find(c => c.id === data.id);
                    if (!exists) {
                        this.comments.push(data);
                        if (this.onCommentAdd) this.onCommentAdd(data);
                    }
                } else if (change.type === 'modified') {
                    const idx = this.comments.findIndex(c => c.id === data.id);
                    if (idx >= 0) this.comments[idx] = data;
                    if (this.onCommentUpdate) this.onCommentUpdate(data);
                } else if (change.type === 'removed') {
                    this.comments = this.comments.filter(c => c.id !== data.id);
                    if (this.onCommentUpdate) this.onCommentUpdate(null, data.id);
                }
            }
        }, err => {
            console.warn('[Collab] Comments listener error:', err);
        });

        this._unsubscribers.push(unsub);
    }

    // ==================== Document Sync ====================

    async syncDocument(documentData, fileName) {
        if (!this.roomId) return;
        try {
            await db.collection('rooms').doc(this.roomId).update({
                fileName: fileName || 'Untitled'
            });
            await this._storeDocument(documentData);
        } catch (err) {
            console.error('[Collab] Sync document failed:', err);
        }
    }

    // ==================== Utilities ====================

    setNickname(name) {
        this.nickname = name || this.nickname;
        localStorage.setItem('pencil-nickname', this.nickname);
        if (this.roomId) {
            db.collection('rooms').doc(this.roomId)
                .collection('users').doc(this.userId)
                .update({ nickname: this.nickname }).catch(() => {});
        }
    }

    getShareUrl() {
        if (!this.roomId) return window.location.href;
        const base = window.location.origin + window.location.pathname;
        return `${base}#room=${this.roomId}`;
    }

    _updateUrl() {
        if (this.roomId) {
            history.replaceState(null, '', `#room=${this.roomId}`);
        }
    }

    getRoomIdFromUrl() {
        const hash = window.location.hash;
        const match = hash.match(/room=([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    _generateId() {
        return 'u_' + Math.random().toString(36).substring(2, 10);
    }

    _generateRoomId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let id = '';
        for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
        return id;
    }

    _loadNickname() {
        return localStorage.getItem('pencil-nickname') || '사용자 ' + Math.floor(Math.random() * 999);
    }

    _assignColor() {
        const colors = ['#6C5CE7','#00CEC9','#FF6B6B','#FDCB6E','#55EFC4','#E17055','#74B9FF','#A29BFE','#FF7675','#81ECEC'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}
