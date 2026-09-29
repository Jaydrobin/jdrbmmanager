# jdrbmmanager
A lightweight, build-free bookmark manager: drag-and-drop (plus touch- and keyboard-friendly move buttons) reordering, dark mode that follows your OS, browser bookmark import, browser-compatible HTML/JSON export, and optional Google sign-in to sync across devices (Firebase) with offline support and home-screen install.

빌드 없이 정적 파일 몇 개로 동작하는 개인용 북마크 관리자입니다.

- **주소:** https://jaydrobin.github.io/jdrbmmanager/ (GitHub Pages, `main` 브랜치 자동 배포)
- 설계 결정과 데이터 구조: [docs/DECISIONS.md](docs/DECISIONS.md) · 개발 규약: [CLAUDE.md](CLAUDE.md)

## 기능

- 북마크 추가·수정·삭제, 검색(제목·URL), 카테고리 필터
- 드래그 앤 드롭 또는 [←]/[→] 버튼으로 순서 변경
- 다크 모드 (직접 고르기 전에는 OS 설정을 따름)
- **브라우저 북마크 가져오기**: 크롬·엣지·파이어폭스에서 내보낸 북마크 HTML을 불러옴. 폴더는 카테고리가 되고, 이미 있는 주소는 건너뜀
- HTML 내보내기(크롬·엣지·파이어폭스에서 가져오기 가능), JSON 백업·복구(덮어쓰기/병합)
- **Google 로그인으로 여러 기기 동기화** (Firestore). 한 기기의 변경이 몇 초 안에 다른 기기에 반영되고, 앱을 열 때는 그사이 바뀐 것만 받음(무료 읽기 한도 절약)
- **오프라인 사용과 홈 화면 설치**: 한 번 연 뒤에는 네트워크 없이도 열고 고칠 수 있고, 연결되면 자동으로 올라감
- **자기 Firebase 프로젝트로 배포**: 저장소를 포크해 `config.js`만 고치면 됨(앱 코드 수정 없음). 로그인 없이 로컬 모드로만 배포할 수도 있음

## 사용법

### 로컬 모드 (로그인 안 함)
주소로 열거나 `index.html`을 브라우저로 바로 열면 됩니다. 데이터는 그 브라우저의 `localStorage`에만 저장됩니다. `index.html`을 파일로 열면(`file://`) 로그인·오프라인 기능 없이 로컬 모드로만 동작합니다.

### 동기화 (클라우드 모드)
1. 주소로 열고 오른쪽 위 **🔑 로그인** → Google 계정 선택. 모든 기기에서 **같은 계정**으로 로그인합니다.
2. 그 기기에 로컬 모드로 만든 북마크가 있으면 처음 한 번 "계정에 올릴까요?"를 묻습니다.
3. 헤더의 상태 표시: `✓ 동기화됨` / `… 연결 중` / `⬆ 올릴 변경 있음` / `⚠ 오프라인`
4. 로그인한 채로 앱을 다시 열면 마지막 목록이 바로 보이고, 서버와 맞춰지는 동안(보통 1초 안팎) 추가·수정·삭제·이동 버튼이 잠깐 비활성화됩니다. 그사이 다른 기기에서 바뀐 것만 받아 오며, 7일에 한 번은 전체를 다시 받습니다.
5. **로그아웃**하면 로그인 전의 로컬 목록으로 돌아가고, 그 기기의 계정 목록 캐시·사본은 지워집니다(계정 데이터는 서버에 남음). 아직 올라가지 않은 변경이 있으면 먼저 묻습니다.

허용된 계정만 데이터에 접근할 수 있습니다. 다른 계정으로 로그인하면 "접근할 수 없습니다" 알림 후 로그아웃됩니다.

#### 삭제 기록 비우기
지운 북마크는 다른 기기에도 삭제를 알리기 위해 서버에 작은 "삭제 기록"으로 남습니다(1개에 약 150바이트, 읽기 한도는 거의 쓰지 않음). 가끔 정리하고 싶으면 로그인 중 헤더의 **상태 표시**(`✓ 동기화됨` 등)를 누르세요. 삭제 기록 수와 용량을 보여 주고, **8일이 지난 기록**만 비울지 묻습니다. 최근 8일 기록은 다른 기기가 아직 그 삭제를 받지 못했을 수 있어 남깁니다(8일 넘게 열지 않은 기기는 다음에 열 때 전체를 다시 받으므로 괜찮음). 인터넷에 연결돼 있을 때만 됩니다.

### 폰에 설치 (안드로이드 크롬)
주소를 크롬으로 연 뒤 메뉴(⋮) → **홈 화면에 추가**(또는 "앱 설치"). 한 번 온라인으로 연 뒤에는 비행기 모드에서도 열립니다.

> **삼성 인터넷**에서 Google 계정을 고른 뒤 앱 선택 창(지메일·아웃룩)이 떠 로그인이 끝나지 않으면, 삼성 인터넷 설정 → **보안 및 개인정보 보호** → **앱에서 바로 링크 열기 차단**을 끄고 다시 로그인하세요 (K-17).

### 브라우저 북마크 가져오기
1. 브라우저에서 북마크를 HTML 파일로 내보냅니다.
   - 크롬: 북마크 관리자(`Ctrl+Shift+O`) → 오른쪽 위 ⋮ → **북마크 내보내기**
   - 엣지: 즐겨찾기(`Ctrl+Shift+O`) → ⋯ → **즐겨찾기 내보내기**
   - 파이어폭스: 북마크 관리(`Ctrl+Shift+O`) → **가져오기 및 백업** → **HTML로 북마크 내보내기**
2. 앱의 **📂 가져오기** → 그 파일을 고르고, 가져올 개수를 확인합니다.

- 기존 목록을 덮어쓰지 않고 목록 맨 앞에 더합니다. 이미 있는 주소와 `http(s)`가 아닌 주소(`javascript:` 북마크릿 등)는 건너뜁니다.
- 폴더는 카테고리가 됩니다. 중첩 폴더는 가장 안쪽 폴더 이름을 쓰고, 북마크바·기타 북마크 같은 브라우저 기본 폴더는 카테고리로 쓰지 않습니다. 추가 시각은 브라우저의 값을 그대로 가져옵니다.
- 이 앱의 **🌐 HTML 내보내기** 파일도 가져올 수 있어, 카테고리와 함께 되돌릴 수 있습니다.

### 백업
동기화와 별개로 **💾 JSON 백업**을 가끔 받아 두세요. 복구는 **📂 가져오기**에서 백업 파일을 고르면 되고, 로컬·클라우드 어느 모드에서 만든 백업도 다른 모드에서 복구할 수 있습니다.

## 설치·배포

PC에 설치할 도구는 없습니다(Node.js 불필요). Firebase는 **Spark(무료) 요금제**로 쓰며 결제 수단을 등록하지 않습니다.

### 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 본체 (CSS·마크업·스크립트). 기본 Firebase 설정값 `DEFAULT_FIREBASE_CONFIG`와 SDK 주소 `FIREBASE_SDK_URL`이 상단에 있음 |
| `config.js` | 배포별 설정 (선택). 저장소에는 주석뿐인 템플릿이라 기본 설정을 씀. 포크한 사람은 여기에 자기 Firebase 설정을 넣음 |
| `sw.js` | 서비스 워커 (오프라인 앱 셸). 캐시 이름 `CACHE_NAME`, SDK 주소 `SDK_BASE`, 없어도 되는 파일 `OPTIONAL_FILES`(`config.js`) |
| `manifest.webmanifest`, `icons/` | 홈 화면 설치용 |
| `firestore.rules` | Firestore 보안 규칙. 호스팅과 별도로 Firebase 콘솔에 게시 |

Firebase 설정값(apiKey 등, `index.html`의 `DEFAULT_FIREBASE_CONFIG` 또는 `config.js`)과 허용 UID는 공개돼도 되는 값입니다. 데이터는 보안 규칙과 승인된 도메인으로 보호합니다. 저장소 전체가 공개 사이트로 배포되므로 비밀 값(서비스 계정 키 등)은 절대 넣지 않습니다.

### 처음 설정 (한 번만, 완료됨)

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트 만들기 (애널리틱스는 꺼도 됨, 요금제는 Spark 그대로)
2. **Authentication** → 로그인 방법 → **Google** 사용 설정
3. **Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**
4. **프로젝트 설정** → 내 앱 → 웹 앱 추가(Hosting 체크 안 함) → 표시되는 `firebaseConfig`의 값을 `config.js`에 넣기(아래 "자기 Firebase 프로젝트로 쓰기"). 이 저장소의 기본 프로젝트 값은 `index.html`의 `DEFAULT_FIREBASE_CONFIG`에 들어 있어 `config.js`는 템플릿 그대로 둔다
5. **Authentication** → 설정 → **승인된 도메인**에 앱 주소(`jaydrobin.github.io`) 추가 (`localhost`는 기본 포함)
6. GitHub 저장소 → **Settings → Pages** → Source `Deploy from a branch`, Branch `main`, 폴더 `/ (root)`
7. 앱에서 한 번 로그인 → **Authentication → 사용자**에서 UID 확인 → `firestore.rules`의 허용 목록에 넣기
8. `firestore.rules` 내용을 **Firestore Database → 규칙**에 붙여넣고 **게시**

### 자기 Firebase 프로젝트로 쓰기 (포크)
`index.html`은 고치지 않고 `config.js`만 바꿉니다.
1. 저장소를 포크합니다.
2. 위 "처음 설정" 1~5단계로 자기 Firebase 프로젝트를 준비합니다. 승인된 도메인에는 자기 GitHub Pages 주소(`<계정>.github.io`)를 넣습니다.
3. `config.js`의 주석을 풀고, 콘솔이 보여 주는 `firebaseConfig` 객체 **안의 값만** 옮깁니다.
   ```js
   window.APP_CONFIG = {
     firebase: {
       apiKey: '...',
       authDomain: '...',
       projectId: '...',
       storageBucket: '...',
       messagingSenderId: '...',
       appId: '...'
     }
   };
   ```
   - 콘솔의 코드를 통째로 붙이면(`import …`, `const firebaseConfig = …`) 동작하지 않습니다.
   - 반드시 `window.APP_CONFIG = …`로 **대입**합니다. `const APP_CONFIG = …`처럼 선언하면 읽히지 않아 로컬 모드로 동작합니다(콘솔에 경고).
   - `window.APP_CONFIG` 말고 다른 선언(`const`, `let`, `function` 등)을 추가하지 않습니다. `index.html`의 이름과 겹치면 앱이 멈춥니다.
   - `apiKey`·`authDomain`·`projectId`·`appId`가 빠지면 로컬 모드로 동작합니다(콘솔에 경고).
4. 자기 저장소에서 GitHub Pages를 켜고(위 6단계), 한 번 로그인해 UID를 확인한 뒤 자기 `firestore.rules`의 허용 목록을 자기 UID로 바꿔 자기 콘솔에 게시합니다(7~8단계).
5. 원래 저장소의 변경을 받아올 때 `config.js`는 거의 바뀌지 않지만, 바뀌어 충돌하면 자기 값을 남기고 해결합니다.

로그인 없이 로컬 모드로만 배포하려면 `config.js`에 `window.APP_CONFIG = { firebase: null };`만 둡니다. 로그인 버튼이 사라지고, 오프라인 사용·홈 화면 설치는 그대로입니다.

`config.js`에 문법 오류가 있으면 파일이 없는 것과 같아져 기본 프로젝트 설정으로 동작합니다(콘솔에 오류). 기본 프로젝트는 여러분의 주소를 허용하지 않으므로 로그인이 되지 않습니다. 로그인 버튼을 눌러도 안 되면 콘솔을 확인하세요.

### 허용 계정 추가
`firestore.rules`의 `uid in [...]`에 UID를 추가하고 콘솔에 다시 게시합니다. 계정마다 목록이 따로이며 무료 한도는 함께 씁니다.

### 배포
`main`에 머지하면 1~2분 뒤 자동 배포됩니다. 규칙(`firestore.rules`)을 바꿨다면 콘솔에 따로 게시해야 합니다.

**릴리스 전에 할 일**
- 규칙을 바꿨으면 **앱을 머지하기 전에** 콘솔에 먼저 게시한다. 새 앱이 새 규칙을 필요로 하면(예: v0.7의 삭제 기록) 거꾸로 할 때 쓰기가 거부된다.
- 앱 파일을 바꿨으면 `sw.js`의 `CACHE_NAME`을 올린다 (예: `jdrbm-v0.8` → `jdrbm-v0.9`). 그래야 설치된 앱이 이전 캐시를 버린다. 캐시할 파일을 추가하면 `APP_SHELL`에, 없는 배포도 있는 파일이면 `OPTIONAL_FILES`에 넣는다.
- Firebase SDK 버전을 올릴 때는 `index.html`의 `FIREBASE_SDK_URL`과 `sw.js`의 `SDK_BASE`를 같은 버전으로 함께 고친다.

배포 직후 폰에서는 이전 버전이 한 번 보일 수 있습니다. 앱을 다시 열면 새 버전으로 바뀝니다.

### 로컬에서 확인
로그인·서비스 워커는 `file://`에서 동작하지 않으므로 저장소 폴더를 `http://localhost:포트`로 서비스해 확인합니다(아무 정적 서버나 가능).

### 폰 테스트 (머지 전 브랜치 확인)
Pages는 `main`을 배포하므로, 머지 전에 폰에서 확인하려면 배포 브랜치를 잠시 바꿉니다.
1. 확인할 커밋을 브랜치에 푸시
2. **Settings → Pages** → Branch를 그 브랜치로 바꾸고 저장 (반영 1~2분)
3. 폰과 PC에서 https://jaydrobin.github.io/jdrbmmanager/ 로 테스트
4. 끝나면 Branch를 **`main`으로 되돌리기** (머지 후에도 `main`인지 확인)

전환해 둔 동안에는 공개 주소에 작업 중인 코드가 올라갑니다.

### 다른 호스팅으로 옮기기
앱 안의 경로가 모두 상대 경로이고 호스팅 전용 설정에 의존하지 않으므로 **앱 코드는 고치지 않습니다.**
1. 새 호스팅(Firebase Hosting, Cloudflare Pages, Netlify, Vercel 등)에 저장소를 연결하거나 파일을 올린다.
2. Firebase 콘솔 → Authentication → 설정 → **승인된 도메인**에 새 주소를 추가한다.
3. (Firebase Hosting만) `firebase.json`을 추가하고, PC의 Firebase CLI(`firebase deploy`)나 GitHub Actions로 배포한다. `firebaseapp.com` 주소로 옮기면 팝업이 막혔을 때 리디렉트 로그인도 쓸 수 있게 된다.

계정 데이터는 새 주소에서 로그인하면 그대로 보입니다. **로컬 모드 데이터는 주소마다 따로라 따라오지 않으므로** 옮기기 전에 JSON 백업으로 옮기세요.
