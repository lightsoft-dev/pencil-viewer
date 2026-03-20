# ✏️ Pencil.dev — 실시간 협업 디자인 뷰어

> .pen 파일을 열고, 팀원과 실시간으로 디자인을 리뷰하세요.

🔗 **배포 링크**: [pencil-viewer-lightsoft.web.app](https://pencil-viewer-lightsoft.web.app)

---

## 📸 미리보기

| 디자인 뷰어 | 공유 모달 | 코멘트 |
|:-----------:|:---------:|:------:|
| 레이어 탐색 & 속성 확인 | 링크 공유로 실시간 협업 | 피그마 스타일 위치 기반 코멘트 |

---

## ✨ 주요 기능

### 🎨 디자인 뷰어
- `.pen` / `.json` 파일 드래그 앤 드롭 또는 파일 선택
- SVG 기반 고품질 렌더링
- 줌 인/아웃, 화면 맞추기, 패닝

### 🗂️ 레이어 패널
- 디자인 요소의 트리 구조 탐색
- 레이어 검색
- 레이어 선택 시 속성 확인

### 🔗 실시간 공유
- **공유 버튼** → 자동 생성된 링크를 팀원에게 전달
- URL 해시 기반 (`#room=방ID`) 간편 참여
- Firestore 실시간 동기화

### 👥 실시간 협업
- 접속 중인 사용자 아바타 표시
- 커서 위치 실시간 동기화
- 입장/퇴장 알림

### 💬 피그마 스타일 코멘트
- 캔버스 위 정확한 위치에 코멘트 배치
- 번호 핀으로 시각적 표시
- 답글, 해결/미해결 토글, 삭제
- 우측 히스토리 패널에서 전체 코멘트 확인
- 모든 참여자에게 실시간 동기화

---

## 🚀 시작하기

### 로컬 실행

```bash
# 저장소 클론
git clone https://github.com/lightsoft-dev/pencil-viewer.git
cd pencil-viewer

# 로컬 서버 실행 (아무 정적 서버 사용 가능)
npx serve . -l 8080

# 또는 Python
python3 -m http.server 8080
```

`http://localhost:8080` 에서 확인하세요.

### Firebase 배포

```bash
# Firebase CLI 설치 (이미 설치된 경우 건너뛰기)
npm install -g firebase-tools

# 로그인
firebase login

# 배포
firebase deploy --only hosting:viewer
```

---

## 🏗️ 기술 스택

| 항목 | 기술 |
|------|------|
| **프론트엔드** | Vanilla HTML / CSS / JavaScript |
| **렌더링** | SVG (Canvas API 기반 좌표 변환) |
| **백엔드** | Firebase Firestore (실시간 동기화) |
| **호스팅** | Firebase Hosting |
| **인증** | 닉네임 기반 (별도 로그인 불필요) |

---

## 📂 프로젝트 구조

```
pencil-viewer/
├── index.html          # 메인 HTML
├── app.js              # 앱 로직 (이벤트, UI, 협업 연동)
├── pen-renderer.js     # .pen → SVG 렌더링 엔진
├── realtime.js         # Firestore 실시간 협업 모듈
├── firebase-config.js  # Firebase 설정
├── style.css           # 전체 스타일
├── firebase.json       # Firebase Hosting 설정
├── .firebaserc         # Firebase 프로젝트 설정
├── demo.json           # 데모 디자인 파일
├── test.pen            # 테스트 .pen 파일
└── images/             # 디자인에 사용되는 이미지 에셋
```

---

## 🔥 Firestore 데이터 구조

```
rooms/{roomId}
├── fileName, createdAt, createdBy
├── data/document          # 디자인 데이터 (JSON)
│   └── chunks/            # 대용량 파일 청크 분할 저장
├── users/{userId}         # 프레젠스 & 커서 위치
└── comments/{commentId}   # 코멘트
    └── replies/{replyId}  # 답글
```

---

## 📄 라이선스

MIT License

---

<p align="center">
  <b>Pencil.dev</b> — 디자인 리뷰를 더 쉽고 빠르게 ✏️
</p>
