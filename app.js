/**
 * Pencil.dev Viewer — Main Application
 * With Firebase-based real-time collaboration
 */

(function() {
    // Core state
    const state = {
        renderer: new PenRenderer(),
        collab: new RealtimeCollaboration(),
        zoom: 1,
        panX: 0,
        panY: 0,
        isPanning: false,
        panStart: { x: 0, y: 0 },
        commentMode: false,
        layersVisible: true,
        selectedNodeId: null,
        documentLoaded: false,
        currentDocData: null,
        currentFileName: null,
        activeCommentId: null
    };

    // DOM refs
    const $ = id => document.getElementById(id);
    const els = {};
    const domIds = [
        'splash-screen','app','file-name','zoom-level','zoom-in-btn','zoom-out-btn','zoom-fit-btn',
        'canvas-container','canvas-viewport','canvas-svg','canvas-content','cursors-layer','comments-layer',
        'empty-state','open-file-btn','file-input','load-demo-btn','drop-overlay',
        'layers-panel','layers-tree','layers-toggle-btn','layers-close-btn','layer-search-input',
        'properties-panel','props-content','props-close-btn',
        'comment-mode-btn','comments-panel','comments-list','comments-close-btn',
        'comment-count',
        'share-btn','share-modal','share-modal-close','share-url-display','copy-link-btn',
        'nickname-input',
        'collaborators','toast-container',
        'room-status','room-id-display'
    ];

    function init() {
        domIds.forEach(id => els[id] = $(id));

        setTimeout(() => {
            els['splash-screen'].style.display = 'none';
            els['app'].classList.remove('hidden');

            // Check if joining via URL
            const roomId = state.collab.getRoomIdFromUrl();
            if (roomId) {
                joinExistingRoom(roomId);
            }
        }, 1200);

        bindEvents();
        setupCollaboration();
    }

    // ==================== Events ====================
    function bindEvents() {
        els['open-file-btn'].addEventListener('click', () => els['file-input'].click());
        els['file-input'].addEventListener('change', handleFileSelect);
        els['load-demo-btn'].addEventListener('click', loadDemoFile);
        els['zoom-in-btn'].addEventListener('click', () => setZoom(state.zoom + 0.1));
        els['zoom-out-btn'].addEventListener('click', () => setZoom(state.zoom - 0.1));
        els['zoom-fit-btn'].addEventListener('click', fitToScreen);
        els['layers-toggle-btn'].addEventListener('click', toggleLayers);
        els['layers-close-btn'].addEventListener('click', toggleLayers);
        els['props-close-btn']?.addEventListener('click', () => els['properties-panel'].style.display = 'none');
        els['comment-mode-btn'].addEventListener('click', toggleCommentMode);
        els['comments-close-btn']?.addEventListener('click', () => {
            els['comments-panel'].style.display = 'none';
            state.commentMode = false;
            els['comment-mode-btn'].classList.remove('active');
            els['canvas-container'].classList.remove('comment-mode');
        });
        els['share-btn'].addEventListener('click', openShareModal);
        els['share-modal-close']?.addEventListener('click', closeShareModal);
        els['share-modal']?.addEventListener('click', e => { if(e.target===els['share-modal']) closeShareModal(); });
        els['copy-link-btn']?.addEventListener('click', copyShareLink);
        els['nickname-input']?.addEventListener('change', e => {
            state.collab.setNickname(e.target.value);
            showToast('success', '닉네임이 변경되었습니다');
        });
        els['layer-search-input']?.addEventListener('input', filterLayers);

        // Canvas interactions
        const cc = els['canvas-container'];
        cc.addEventListener('mousedown', onCanvasMouseDown);
        cc.addEventListener('mousemove', onCanvasMouseMove);
        cc.addEventListener('mouseup', onCanvasMouseUp);
        cc.addEventListener('mouseleave', onCanvasMouseUp);
        cc.addEventListener('wheel', onCanvasWheel, { passive: false });
        cc.addEventListener('click', onCanvasClick);

        // Drag & drop
        cc.addEventListener('dragover', e => { e.preventDefault(); els['drop-overlay'].classList.add('visible'); });
        cc.addEventListener('dragleave', () => els['drop-overlay'].classList.remove('visible'));
        cc.addEventListener('drop', handleDrop);

        // Keyboard
        document.addEventListener('keydown', onKeyDown);

        // Close comment popup on outside click (but not from canvas)
        document.addEventListener('click', e => {
            if (e.target.closest('.canvas-container')) return; // handled by onCanvasClick
            if (!e.target.closest('.comment-popup') && !e.target.closest('.comment-pin') && !e.target.closest('.comment-mode-btn')) {
                closeAllCommentPopups();
            }
        });
    }

    // ==================== File Handling ====================
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) loadFile(file);
    }

    function handleDrop(e) {
        e.preventDefault();
        els['drop-overlay'].classList.remove('visible');
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
    }

    function loadFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                state.currentDocData = data;
                state.currentFileName = file.name;
                renderDocument(data, file.name);

                // Create a room and share the document
                const roomId = await state.collab.createRoom(data, file.name);
                showToast('success', `${file.name} 로드 완료 — 공유 준비됨`);
                updateRoomStatus();
            } catch (err) {
                showToast('error', '파일 파싱 실패: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    function loadDemoFile() {
        fetch('./demo.json')
            .then(res => {
                if (!res.ok) return fetch('./test.pen');
                return res;
            })
            .then(res => {
                if (!res.ok) throw new Error('demo file not found');
                return res.json();
            })
            .then(async data => {
                state.currentDocData = data;
                state.currentFileName = 'MyWeatherPal-demo.pen';
                renderDocument(data, 'MyWeatherPal-demo.pen');

                // Create room
                const roomId = await state.collab.createRoom(data, 'MyWeatherPal-demo.pen');
                showToast('success', '데모 파일 로드 완료 — 공유 준비됨');
                updateRoomStatus();
            })
            .catch(() => {
                // Fallback simple demo
                const demo = createFallbackDemo();
                state.currentDocData = demo;
                state.currentFileName = 'Demo.pen';
                renderDocument(demo, 'Demo.pen');
                showToast('success', '데모 파일이 로드되었습니다');
            });
    }

    function createFallbackDemo() {
        return {
            version: "1.0",
            variables: {
                "primary": { type: "color", value: "#6C5CE7" },
                "bg": { type: "color", value: "#F8F9FA" }
            },
            children: [
                {
                    type: "frame", id: "app-screen", name: "App Screen", x: 0, y: 0, width: 390, height: 844,
                    fill: "$bg", cornerRadius: 24, clip: true,
                    children: [
                        {
                            type: "frame", id: "hero", name: "Hero", x: 16, y: 70, width: 358, height: 200,
                            fill: { type: "gradient", gradientType: "linear", rotation: 135,
                                colors: [{ color: "#6C5CE7", position: 0 }, { color: "#A29BFE", position: 1 }] },
                            cornerRadius: 20,
                            children: [
                                { type: "text", id: "title", x: 28, y: 30, content: "Pencil.dev", fontSize: 48, fontWeight: "800", fill: "#FFFFFF", fontFamily: "Inter" },
                                { type: "text", id: "sub", x: 28, y: 100, content: "실시간 협업 디자인 뷰어", fontSize: 18, fontWeight: "500", fill: "rgba(255,255,255,0.85)", fontFamily: "Inter" }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    async function joinExistingRoom(roomId) {
        try {
            showToast('info', '공유된 디자인을 불러오는 중…');
            // Show a loading indicator
            els['empty-state'].querySelector('h2').textContent = '공유 디자인 로딩 중…';
            els['empty-state'].querySelector('p').textContent = '잠시만 기다려주세요.';
            if (els['open-file-btn']) els['open-file-btn'].style.display = 'none';
            if (els['load-demo-btn']) els['load-demo-btn'].style.display = 'none';

            await state.collab.joinRoom(roomId);
            updateRoomStatus();
            showToast('success', '공유 디자인에 연결되었습니다!');
        } catch (err) {
            console.error('Join failed:', err);
            showToast('error', '방 참여 실패: ' + err.message);
            // Reset empty state
            els['empty-state'].querySelector('h2').textContent = '.pen 파일을 열어보세요';
            els['empty-state'].querySelector('p').innerHTML = '파일을 드래그 앤 드롭하거나<br>아래 버튼을 클릭하세요.';
            if (els['open-file-btn']) els['open-file-btn'].style.display = '';
            if (els['load-demo-btn']) els['load-demo-btn'].style.display = '';
        }
    }

    // ==================== Rendering ====================
    function renderDocument(data, fileName) {
        state.renderer.loadDocument(data);
        state.documentLoaded = true;
        els['file-name'].textContent = (fileName || '').replace('.pen', '').replace('.json', '');
        els['empty-state'].style.display = 'none';
        els['canvas-viewport'].style.display = 'block';

        const bounds = state.renderer.renderToSVG(els['canvas-content']);
        renderLayerTree();
        fitToScreen(bounds);
    }

    // ==================== Canvas Controls ====================
    function setZoom(z) {
        state.zoom = Math.max(0.1, Math.min(5, z));
        els['zoom-level'].textContent = Math.round(state.zoom * 100) + '%';
        applyTransform();
    }

    function applyTransform() {
        els['canvas-content'].setAttribute('transform', `translate(${state.panX}, ${state.panY}) scale(${state.zoom})`);
        els['cursors-layer'].setAttribute('transform', `translate(${state.panX}, ${state.panY}) scale(${state.zoom})`);
        // Comment pins are HTML overlays — reposition on transform
        updateCommentPinPositions();
    }

    function updateCommentPinPositions() {
        document.querySelectorAll('.comment-pin-html').forEach(pin => {
            const cx = parseFloat(pin.dataset.cx);
            const cy = parseFloat(pin.dataset.cy);
            const sx = cx * state.zoom + state.panX;
            const sy = cy * state.zoom + state.panY;
            pin.style.left = sx + 'px';
            pin.style.top = sy + 'px';
        });
    }

    function fitToScreen(bounds) {
        if (!bounds) {
            bounds = state.renderer._calculateBounds(state.renderer.document?.children || []);
        }
        const container = els['canvas-container'];
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const padding = 80;
        const scaleX = (cw - padding * 2) / bounds.width;
        const scaleY = (ch - padding * 2) / bounds.height;
        state.zoom = Math.min(scaleX, scaleY, 1.5);
        state.panX = (cw - bounds.width * state.zoom) / 2 - bounds.x * state.zoom;
        state.panY = (ch - bounds.height * state.zoom) / 2 - bounds.y * state.zoom;
        els['zoom-level'].textContent = Math.round(state.zoom * 100) + '%';
        applyTransform();
    }

    // ==================== Mouse Events ====================
    function onCanvasMouseDown(e) {
        if (state.commentMode) return; // Don't start panning in comment mode
        if (e.target.closest('.comment-popup') || e.target.closest('.comment-pin')) return;
        state.isPanning = true;
        state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
        state.panMoved = false;
        els['canvas-container'].style.cursor = 'grabbing';
    }

    function onCanvasMouseMove(e) {
        // Send cursor position to Firebase
        if (state.collab.roomId && state.documentLoaded) {
            const rect = els['canvas-container'].getBoundingClientRect();
            const cx = (e.clientX - rect.left - state.panX) / state.zoom;
            const cy = (e.clientY - rect.top - state.panY) / state.zoom;
            state.collab.updateCursor(cx, cy);
        }

        if (!state.isPanning) return;
        state.panMoved = true;
        state.panX = e.clientX - state.panStart.x;
        state.panY = e.clientY - state.panStart.y;
        applyTransform();
    }

    function onCanvasMouseUp() {
        state.isPanning = false;
        els['canvas-container'].style.cursor = state.commentMode ? 'crosshair' : '';
    }

    function onCanvasWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        const rect = els['canvas-container'].getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const oldZoom = state.zoom;
        state.zoom = Math.max(0.1, Math.min(5, state.zoom + delta));
        const scale = state.zoom / oldZoom;
        state.panX = mx - (mx - state.panX) * scale;
        state.panY = my - (my - state.panY) * scale;
        els['zoom-level'].textContent = Math.round(state.zoom * 100) + '%';
        applyTransform();
    }

    function onCanvasClick(e) {
        if (e.target.closest('.comment-popup') || e.target.closest('.comment-pin')) return;

        if (state.commentMode) {
            // Place a comment at the clicked position
            const rect = els['canvas-container'].getBoundingClientRect();
            const cx = (e.clientX - rect.left - state.panX) / state.zoom;
            const cy = (e.clientY - rect.top - state.panY) / state.zoom;
            showCommentInput(cx, cy);
            return;
        }

        // Check if clicked on a pen object
        const target = e.target.closest('.pen-object');
        if (target) {
            selectNode(target.getAttribute('data-pen-id'));
        }
    }

    function onKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === '0' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fitToScreen(); }
        if (e.key === '=' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setZoom(state.zoom + 0.1); }
        if (e.key === '-' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setZoom(state.zoom - 0.1); }
        if (e.key === 'Escape') {
            state.selectedNodeId = null;
            els['properties-panel'].style.display = 'none';
            closeAllCommentPopups();
            if (state.commentMode) toggleCommentMode();
        }
    }

    // ==================== Layer Panel ====================
    function toggleLayers() {
        state.layersVisible = !state.layersVisible;
        els['layers-panel'].style.display = state.layersVisible ? 'flex' : 'none';
        els['layers-toggle-btn'].classList.toggle('active', state.layersVisible);
    }

    function renderLayerTree() {
        const tree = state.renderer.getLayerTree();
        els['layers-tree'].innerHTML = '';
        renderLayerItems(tree, els['layers-tree'], 0);
    }

    function renderLayerItems(items, container, depth) {
        for (const item of items) {
            const div = document.createElement('div');
            div.className = 'layer-item';
            div.style.paddingLeft = (16 + depth * 16) + 'px';
            div.innerHTML = `
                ${item.children ? '<span class="material-symbols-rounded layer-toggle expanded" style="font-size:14px">chevron_right</span>' : '<span style="width:14px;display:inline-block"></span>'}
                <span class="material-symbols-rounded layer-icon">${item.icon}</span>
                <span class="layer-name">${item.name}</span>
            `;
            div.addEventListener('click', () => selectNode(item.id));
            container.appendChild(div);

            if (item.children) {
                const childContainer = document.createElement('div');
                childContainer.className = 'layer-children';
                renderLayerItems(item.children, childContainer, depth + 1);
                container.appendChild(childContainer);
            }
        }
    }

    function filterLayers() {
        const q = els['layer-search-input'].value.toLowerCase();
        els['layers-tree'].querySelectorAll('.layer-item').forEach(item => {
            const name = item.querySelector('.layer-name')?.textContent.toLowerCase() || '';
            item.style.display = name.includes(q) ? 'flex' : 'none';
        });
    }

    // ==================== Selection & Properties ====================
    function selectNode(id) {
        state.selectedNodeId = id;
        els['layers-tree'].querySelectorAll('.layer-item').forEach(el => el.classList.remove('selected'));
        const props = state.renderer.getNodeProperties(id);
        if (!props) return;
        showProperties(props);
    }

    function showProperties(props) {
        els['properties-panel'].style.display = 'flex';
        let html = `<div class="prop-section"><div class="prop-section-title">정보</div>
            <div class="prop-row"><span class="prop-label">타입</span><span class="prop-value">${props.type}</span></div>
            <div class="prop-row"><span class="prop-label">이름</span><span class="prop-value">${props.name}</span></div></div>
            <div class="prop-section"><div class="prop-section-title">위치 & 크기</div>
            <div class="prop-row"><span class="prop-label">X</span><span class="prop-value">${props.position.x}</span></div>
            <div class="prop-row"><span class="prop-label">Y</span><span class="prop-value">${props.position.y}</span></div>
            <div class="prop-row"><span class="prop-label">W</span><span class="prop-value">${props.size.width}</span></div>
            <div class="prop-row"><span class="prop-label">H</span><span class="prop-value">${props.size.height}</span></div>
            <div class="prop-row"><span class="prop-label">회전</span><span class="prop-value">${props.rotation}°</span></div>
            <div class="prop-row"><span class="prop-label">투명도</span><span class="prop-value">${Math.round(props.opacity * 100)}%</span></div></div>`;
        if (props.fills.length > 0) {
            html += `<div class="prop-section"><div class="prop-section-title">채움</div>`;
            for (const f of props.fills) {
                html += `<div class="prop-row"><span class="prop-color-swatch"><span class="swatch" style="background:${f.color}"></span><span class="prop-value">${f.color}</span></span></div>`;
            }
            html += `</div>`;
        }
        if (props.typography) {
            html += `<div class="prop-section"><div class="prop-section-title">텍스트</div>
                <div class="prop-row"><span class="prop-label">폰트</span><span class="prop-value">${props.typography.fontFamily}</span></div>
                <div class="prop-row"><span class="prop-label">크기</span><span class="prop-value">${props.typography.fontSize}px</span></div>
                <div class="prop-row"><span class="prop-label">무게</span><span class="prop-value">${props.typography.fontWeight}</span></div></div>`;
        }
        els['props-content'].innerHTML = html;
    }

    // ==================== Comments (Figma-style) ====================
    function toggleCommentMode() {
        state.commentMode = !state.commentMode;
        els['comment-mode-btn'].classList.toggle('active', state.commentMode);
        els['canvas-container'].classList.toggle('comment-mode', state.commentMode);
        els['canvas-container'].style.cursor = state.commentMode ? 'crosshair' : '';

        if (state.commentMode) {
            els['comments-panel'].style.display = 'flex';
        }
    }

    function showCommentInput(x, y) {
        closeAllCommentPopups();

        // Create HTML comment pin (new comment indicator)
        const pin = document.createElement('div');
        pin.className = 'comment-pin-html new-comment';
        pin.style.left = (x * state.zoom + state.panX) + 'px';
        pin.style.top = (y * state.zoom + state.panY) + 'px';
        pin.dataset.cx = x;
        pin.dataset.cy = y;
        pin.innerHTML = '<span>+</span>';
        pin.style.background = state.collab.color;
        els['canvas-container'].appendChild(pin);

        // Create HTML popup for input
        const popup = document.createElement('div');
        popup.className = 'comment-popup';
        popup.style.position = 'absolute';
        popup.style.left = (x * state.zoom + state.panX + 20) + 'px';
        popup.style.top = (y * state.zoom + state.panY - 10) + 'px';

        popup.innerHTML = `
            <div class="comment-popup-header">
                <div class="comment-popup-avatar" style="background:${state.collab.color}">${(state.collab.nickname || '?')[0]}</div>
                <span class="comment-popup-name">${state.collab.nickname}</span>
            </div>
            <textarea class="comment-popup-input" placeholder="코멘트를 입력하세요…" autofocus></textarea>
            <div class="comment-popup-actions">
                <button class="comment-cancel-btn">취소</button>
                <button class="comment-submit-btn">게시</button>
            </div>
        `;

        els['canvas-container'].appendChild(popup);

        const textarea = popup.querySelector('.comment-popup-input');
        const submitBtn = popup.querySelector('.comment-submit-btn');
        const cancelBtn = popup.querySelector('.comment-cancel-btn');

        setTimeout(() => textarea.focus(), 50);

        const cleanup = () => { popup.remove(); pin.remove(); };

        const submit = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            submitBtn.disabled = true;
            submitBtn.textContent = '게시 중…';
            await state.collab.addComment(text, x, y);
            cleanup();
        };

        submitBtn.addEventListener('click', submit);
        cancelBtn.addEventListener('click', cleanup);
        textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
            if (e.key === 'Escape') cleanup();
        });
    }

    function renderCommentPin(comment) {
        // Remove existing HTML pin for this comment
        const existing = els['canvas-container'].querySelector(`.comment-pin-html[data-comment-id="${comment.id}"]`);
        if (existing) existing.remove();

        if (!comment.x && !comment.y) return;

        const pinIndex = state.collab.comments.findIndex(c => c.id === comment.id) + 1;
        const pin = document.createElement('div');
        pin.className = `comment-pin-html ${comment.resolved ? 'resolved' : ''}`;
        pin.setAttribute('data-comment-id', comment.id);
        pin.dataset.cx = comment.x;
        pin.dataset.cy = comment.y;
        pin.style.left = (comment.x * state.zoom + state.panX) + 'px';
        pin.style.top = (comment.y * state.zoom + state.panY) + 'px';
        pin.style.background = comment.resolved ? '#636E72' : (comment.authorColor || '#6C5CE7');
        pin.innerHTML = `<span>${pinIndex}</span>`;

        // Click to show thread
        pin.addEventListener('click', (e) => {
            e.stopPropagation();
            const latest = state.collab.comments.find(c => c.id === comment.id) || comment;
            showCommentThread(latest);
        });

        // Drag to move
        let isDragging = false, dragStartX, dragStartY, pinOrigX, pinOrigY;
        pin.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            pinOrigX = comment.x;
            pinOrigY = comment.y;

            const onMove = (me) => {
                const dx = me.clientX - dragStartX;
                const dy = me.clientY - dragStartY;
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDragging = true;
                if (isDragging) {
                    const newScreenX = pinOrigX * state.zoom + state.panX + dx;
                    const newScreenY = pinOrigY * state.zoom + state.panY + dy;
                    pin.style.left = newScreenX + 'px';
                    pin.style.top = newScreenY + 'px';
                }
            };

            const onUp = async (me) => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (isDragging) {
                    const dx = me.clientX - dragStartX;
                    const dy = me.clientY - dragStartY;
                    const newX = pinOrigX + dx / state.zoom;
                    const newY = pinOrigY + dy / state.zoom;
                    comment.x = newX;
                    comment.y = newY;
                    pin.dataset.cx = newX;
                    pin.dataset.cy = newY;
                    await state.collab.moveComment(comment.id, newX, newY);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.stopPropagation();
        });

        els['canvas-container'].appendChild(pin);
    }

    function showCommentThread(comment) {
        closeAllCommentPopups();

        const popup = document.createElement('div');
        popup.className = 'comment-popup comment-thread-popup';
        popup.style.position = 'absolute';

        const screenX = comment.x * state.zoom + state.panX;
        const screenY = comment.y * state.zoom + state.panY;
        popup.style.left = (screenX + 24) + 'px';
        popup.style.top = (screenY - 10) + 'px';

        const time = formatTime(comment.timestamp);
        const editedLabel = comment.editedAt ? ' <span class="comment-edited-label">(수정됨)</span>' : '';
        const replies = comment.replies ? Object.values(comment.replies) : [];

        let repliesHtml = replies.map(r => `
            <div class="comment-thread-reply">
                <div class="comment-thread-avatar" style="background:${r.authorColor}">${(r.authorName || '?')[0]}</div>
                <div class="comment-thread-body">
                    <div class="comment-thread-meta">
                        <span class="comment-thread-author">${r.authorName}</span>
                        <span class="comment-thread-time">${formatTime(r.timestamp)}</span>
                    </div>
                    <div class="comment-thread-text">${r.text}</div>
                </div>
            </div>
        `).join('');

        popup.innerHTML = `
            <div class="comment-thread-main">
                <div class="comment-thread-header">
                    <div class="comment-thread-avatar" style="background:${comment.authorColor}">${(comment.authorName || '?')[0]}</div>
                    <div class="comment-thread-body">
                        <div class="comment-thread-meta">
                            <span class="comment-thread-author">${comment.authorName}</span>
                            <span class="comment-thread-time">${time}${editedLabel}</span>
                        </div>
                        <div class="comment-thread-text" data-text-display>${comment.text}</div>
                    </div>
                    <div class="comment-thread-actions-top">
                        <button class="comment-edit-btn" title="수정">
                            <span class="material-symbols-rounded">edit</span>
                        </button>
                        <button class="comment-resolve-btn" title="${comment.resolved ? '다시 열기' : '해결됨'}">
                            <span class="material-symbols-rounded">${comment.resolved ? 'refresh' : 'check_circle'}</span>
                        </button>
                        <button class="comment-delete-btn" title="삭제">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                </div>
                ${replies.length ? '<div class="comment-thread-replies">' + repliesHtml + '</div>' : ''}
            </div>
            <div class="comment-thread-reply-input">
                <textarea class="comment-popup-input reply-input" placeholder="답글을 입력하세요…"></textarea>
                <button class="comment-reply-submit-btn">
                    <span class="material-symbols-rounded">send</span>
                </button>
            </div>
        `;

        els['canvas-container'].appendChild(popup);

        // Edit button
        popup.querySelector('.comment-edit-btn')?.addEventListener('click', () => {
            const textEl = popup.querySelector('[data-text-display]');
            const currentText = comment.text;
            textEl.innerHTML = `
                <textarea class="comment-edit-textarea">${currentText}</textarea>
                <div class="comment-edit-actions">
                    <button class="comment-edit-cancel">취소</button>
                    <button class="comment-edit-save">저장</button>
                </div>
            `;
            const editArea = textEl.querySelector('.comment-edit-textarea');
            editArea.focus();
            editArea.setSelectionRange(editArea.value.length, editArea.value.length);

            textEl.querySelector('.comment-edit-cancel').addEventListener('click', () => {
                textEl.innerHTML = currentText;
            });

            textEl.querySelector('.comment-edit-save').addEventListener('click', async () => {
                const newText = editArea.value.trim();
                if (!newText) return;
                await state.collab.editComment(comment.id, newText);
                comment.text = newText;
                textEl.innerHTML = newText + ' <span class="comment-edited-label">(수정됨)</span>';
            });

            editArea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    textEl.querySelector('.comment-edit-save').click();
                }
                if (e.key === 'Escape') {
                    textEl.innerHTML = currentText;
                }
            });
        });

        // Resolve button
        popup.querySelector('.comment-resolve-btn')?.addEventListener('click', async () => {
            await state.collab.toggleResolve(comment.id);
            popup.remove();
        });

        // Delete button
        popup.querySelector('.comment-delete-btn')?.addEventListener('click', async () => {
            if (confirm('이 코멘트를 삭제하시겠습니까?')) {
                await state.collab.deleteComment(comment.id);
                popup.remove();
            }
        });

        // Reply
        const replyInput = popup.querySelector('.reply-input');
        const replyBtn = popup.querySelector('.comment-reply-submit-btn');

        const submitReply = async () => {
            const text = replyInput.value.trim();
            if (!text) return;
            await state.collab.addReply(comment.id, text);
            replyInput.value = '';
            popup.remove();
            setTimeout(() => {
                const updated = state.collab.comments.find(c => c.id === comment.id);
                if (updated) showCommentThread(updated);
            }, 300);
        };

        replyBtn?.addEventListener('click', submitReply);
        replyInput?.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitReply(); }
        });

        setTimeout(() => replyInput?.focus(), 50);
    }

    function closeAllCommentPopups() {
        document.querySelectorAll('.comment-popup').forEach(p => p.remove());
        document.querySelectorAll('.comment-pin-html.new-comment').forEach(p => p.remove());
    }

    function renderCommentInPanel(comment) {
        const existing = els['comments-list'].querySelector(`[data-comment-panel-id="${comment.id}"]`);
        if (existing) existing.remove();

        const pinIndex = state.collab.comments.findIndex(c => c.id === comment.id) + 1;
        const time = formatTime(comment.timestamp);
        const replies = comment.replies ? Object.values(comment.replies) : [];

        const item = document.createElement('div');
        item.className = `comment-panel-item ${comment.resolved ? 'resolved' : ''}`;
        item.setAttribute('data-comment-panel-id', comment.id);
        item.innerHTML = `
            <div class="comment-panel-pin" style="background:${comment.resolved ? '#636E72' : comment.authorColor}">${pinIndex}</div>
            <div class="comment-panel-body">
                <div class="comment-panel-meta">
                    <span class="comment-panel-author">${comment.authorName}</span>
                    <span class="comment-panel-time">${time}</span>
                    ${comment.resolved ? '<span class="comment-resolved-badge">해결됨</span>' : ''}
                </div>
                <div class="comment-panel-text">${comment.text}</div>
                ${replies.length ? `<div class="comment-panel-replies-count">${replies.length}개의 답글</div>` : ''}
            </div>
        `;

        item.addEventListener('click', () => {
            // Pan to comment position
            if (comment.x && comment.y) {
                const container = els['canvas-container'];
                const cw = container.clientWidth;
                const ch = container.clientHeight;
                state.panX = cw / 2 - comment.x * state.zoom;
                state.panY = ch / 2 - comment.y * state.zoom;
                applyTransform();
                showCommentThread(comment);
            }
        });

        els['comments-list'].appendChild(item);

        // Update count badge
        const count = state.collab.comments.filter(c => !c.resolved).length;
        els['comment-count'].textContent = count;
        els['comment-count'].style.display = count > 0 ? 'flex' : 'none';
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return '방금 전';
        if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전';
        return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    // ==================== Collaboration ====================
    function setupCollaboration() {
        const collab = state.collab;

        collab.onDocumentSync = (data, fileName) => {
            state.currentDocData = data;
            state.currentFileName = fileName;
            renderDocument(data, fileName);
        };

        collab.onUserJoin = (data) => {
            showToast('info', `${data.nickname}님이 참여했습니다`);
        };

        collab.onUserLeave = (user) => {
            if (user) {
                showToast('info', `${user.nickname}님이 나갔습니다`);
                // Remove their cursor
                const cursor = els['cursors-layer'].querySelector(`[data-cursor-id="${user.id}"]`);
                if (cursor) cursor.remove();
            }
        };

        collab.onCursorMove = renderRemoteCursor;

        collab.onCommentAdd = (comment) => {
            renderCommentPin(comment);
            renderCommentInPanel(comment);
        };

        collab.onCommentUpdate = (comment, removedId) => {
            if (removedId) {
                // Comment removed — find HTML pin
                const pin = els['canvas-container'].querySelector(`.comment-pin-html[data-comment-id="${removedId}"]`);
                if (pin) pin.remove();
                const panelItem = els['comments-list'].querySelector(`[data-comment-panel-id="${removedId}"]`);
                if (panelItem) panelItem.remove();
                return;
            }
            if (comment) {
                renderCommentPin(comment);
                renderCommentInPanel(comment);
            }
        };

        collab.onUsersUpdate = renderCollaborators;

        collab.onRoomReady = (roomId) => {
            updateRoomStatus();
        };

        // Set nickname
        if (els['nickname-input']) {
            els['nickname-input'].value = collab.nickname;
        }
    }

    function renderRemoteCursor(data) {
        const ns = 'http://www.w3.org/2000/svg';
        let cursor = els['cursors-layer'].querySelector(`[data-cursor-id="${data.userId}"]`);
        if (!cursor) {
            cursor = document.createElementNS(ns, 'g');
            cursor.classList.add('remote-cursor');
            cursor.setAttribute('data-cursor-id', data.userId);

            const arrow = document.createElementNS(ns, 'path');
            arrow.setAttribute('d', 'M0 0 L0 16 L4 12 L8 20 L12 18 L8 10 L14 10 Z');
            arrow.setAttribute('fill', data.color);
            cursor.appendChild(arrow);

            const labelBg = document.createElementNS(ns, 'rect');
            labelBg.setAttribute('x', 14);
            labelBg.setAttribute('y', 14);
            labelBg.setAttribute('height', 20);
            labelBg.setAttribute('rx', 4);
            labelBg.setAttribute('fill', data.color);
            const label = document.createElementNS(ns, 'text');
            label.setAttribute('x', 20);
            label.setAttribute('y', 28);
            label.setAttribute('fill', 'white');
            label.setAttribute('font-size', '11');
            label.setAttribute('font-family', 'Inter, sans-serif');
            label.setAttribute('font-weight', '600');
            label.textContent = data.nickname;
            labelBg.setAttribute('width', data.nickname.length * 7 + 14);

            cursor.appendChild(labelBg);
            cursor.appendChild(label);
            els['cursors-layer'].appendChild(cursor);
        }
        cursor.setAttribute('transform', `translate(${data.x}, ${data.y})`);
    }

    function renderCollaborators(users) {
        els['collaborators'].innerHTML = '';
        users.forEach(user => {
            const av = document.createElement('div');
            av.className = 'collaborator-avatar';
            av.style.background = user.color;
            av.textContent = (user.nickname || '?')[0].toUpperCase();
            av.innerHTML += `<span class="tooltip">${user.nickname}${user.isMe ? ' (나)' : ''}</span>`;
            els['collaborators'].appendChild(av);
        });
    }

    // ==================== Share Modal ====================
    function openShareModal() {
        els['share-modal'].style.display = 'flex';

        if (state.collab.roomId) {
            const shareUrl = state.collab.getShareUrl();
            els['share-url-display'].value = shareUrl;
        } else {
            els['share-url-display'].value = '파일을 먼저 로드해주세요';
        }
    }

    function closeShareModal() {
        els['share-modal'].style.display = 'none';
    }

    function copyShareLink() {
        if (!state.collab.roomId) {
            showToast('error', '공유할 파일을 먼저 로드해주세요');
            return;
        }
        const url = state.collab.getShareUrl();
        navigator.clipboard.writeText(url).then(() => {
            showToast('success', '공유 링크가 복사되었습니다! 팀원에게 보내주세요');
            els['copy-link-btn'].innerHTML = '<span class="material-symbols-rounded">check</span> 복사됨';
            setTimeout(() => {
                els['copy-link-btn'].innerHTML = '<span class="material-symbols-rounded">content_copy</span> 링크 복사';
            }, 2000);
        });
    }

    function updateRoomStatus() {
        if (els['room-status']) {
            if (state.collab.roomId) {
                els['room-status'].innerHTML = `<span class="status-dot live"></span> 실시간 공유 중`;
                els['room-status'].style.display = 'flex';
            } else {
                els['room-status'].style.display = 'none';
            }
        }
        if (els['room-id-display']) {
            els['room-id-display'].textContent = state.collab.roomId || '';
        }
    }

    // ==================== Toast ====================
    function showToast(type, message) {
        const icons = { success: 'check_circle', error: 'error', info: 'info' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="material-symbols-rounded toast-icon">${icons[type] || 'info'}</span><span>${message}</span>`;
        els['toast-container'].appendChild(toast);
        setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // Boot
    document.addEventListener('DOMContentLoaded', init);
})();
