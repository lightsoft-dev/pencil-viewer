# ✏️ Pencil.dev — Real-time Collaborative Design Viewer

> Open .pen files and review designs in real-time with your team.

🔗 **Deployment Link**: [pencil-viewer-lightsoft.web.app](https://pencil-viewer-lightsoft.web.app)

---

## 📸 Preview

| Design Viewer | Share Modal | Comments |
|:-----------:|:---------:|:------:|
| Layer exploration & Properties | Real-time collaboration via link sharing | Figma-style position-based comments |

---

## ✨ Key Features

### 🎨 Design Viewer
- Drag-and-drop `.pen` / `.json` files or select them manually
- High-quality SVG-based rendering
- Zoom in/out, fit to screen, and panning

### 🗂️ Layers Panel
- Explore the tree structure of design elements
- Search for layers
- View properties upon layer selection

### 🔗 Real-time Sharing
- **Share button** → Automatically generate a link to send to your team
- Easy participation using URL hashes (`#room=RoomID`)
- Firestore real-time synchronization

### 👥 Real-time Collaboration
- Display avatars of currently connected users
- Real-time cursor position synchronization
- Join/leave notifications

### 💬 Figma-style Comments
- Place comments at precise locations on the canvas
- Numbered pins for visual indication
- Replies, resolve/unresolve toggle, delete
- View all comments in the right history panel
- Real-time synchronization for all participants

---

## 🚀 Getting Started

### Run Locally

```bash
# Clone the repository
git clone https://github.com/lightsoft-dev/pencil-viewer.git
cd pencil-viewer

# Run a local server (any static server will do)
npx serve . -l 8080

# Or Python
python3 -m http.server 8080
```

Check it out at `http://localhost:8080`.

### Firebase Deployment

```bash
# Install Firebase CLI (skip if already installed)
npm install -g firebase-tools

# Login
firebase login

# Deploy
firebase deploy --only hosting:viewer
```

---

## 🏗️ Tech Stack

| Category | Technology |
|------|------|
| **Frontend** | Vanilla HTML / CSS / JavaScript |
| **Rendering** | SVG (Coordinate transformation based on Canvas API) |
| **Backend** | Firebase Firestore (Real-time synchronization) |
| **Hosting** | Firebase Hosting |
| **Authentication** | Nickname-based (No separate login required) |

---

## 📂 Project Structure

```
pencil-viewer/
├── index.html          # Main HTML
├── app.js              # App logic (events, UI, collaboration integration)
├── pen-renderer.js     # .pen → SVG rendering engine
├── realtime.js         # Firestore real-time collaboration module
├── firebase-config.js  # Firebase configuration
├── style.css           # Global styles
├── firebase.json       # Firebase Hosting configuration
├── .firebaserc         # Firebase project configuration
├── demo.json           # Demo design file
├── test.pen            # Test .pen file
└── images/             # Image assets used in designs
```

---

## 🔥 Firestore Data Structure

```
rooms/{roomId}
├── fileName, createdAt, createdBy
├── data/document          # Design data (JSON)
│   └── chunks/            # Splitting and storing large files into chunks
├── users/{userId}         # Presence & cursor positions
└── comments/{commentId}   # Comments
    └── replies/{replyId}  # Replies
```

---

## 📄 License

MIT License

---

<p align="center">
  <b>Pencil.dev</b> — Making design review easier and faster ✏️
</p>