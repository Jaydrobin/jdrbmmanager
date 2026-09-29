# CLAUDE.md

정적 파일 몇 개로 된 북마크 관리자. 빌드·패키지·자동 테스트가 없고, `index.html`을 브라우저로 열면 로컬 모드로 실행된다. `http(s)`로 열면 Google 로그인과 Firestore 동기화(클라우드 모드)를 쓸 수 있다. Firestore 보안 규칙은 `firestore.rules`에 두고 사용자가 Firebase 콘솔에 게시한다. `https`·`localhost`에서는 서비스 워커(`sw.js`)가 앱 파일과 SDK를 캐시해 오프라인에서도 열리고, `manifest.webmanifest`·`icons/`로 홈 화면에 설치할 수 있다.

- 기능 목록, 데이터 모델(localStorage·Firestore), 설계 결정(D-NNN), 알려진 문제(K-NN): [docs/DECISIONS.md](docs/DECISIONS.md) — **작업 전에 읽는다.** 동기화 설계는 D-017~D-023.
- 사용법, Firebase·GitHub Pages 설정, 배포·폰 테스트·호스팅 이전 절차: [README.md](README.md).
- 진행 중인 설계: 바뀐 것만 받기(D-025) [docs/IMPORT-DELTA-DESIGN.md](docs/IMPORT-DELTA-DESIGN.md) — 7장의 2단계부터 구현한다(1단계 브라우저 북마크 가져오기는 D-024로 옮김). 설계와 충돌하는 규약은 해당 단계에서 바꾼다.

## 구조

| 파일 | 내용 |
|---|---|
| `index.html` | 앱 본체. `<style>` → 마크업 → `<script>` 순서. 스크립트는 아래 표처럼 주석으로 구역을 나눈다 |
| `sw.js` | 서비스 워커. `CACHE_NAME`(릴리스마다 올림), `SDK_BASE`(`index.html`의 SDK 버전과 같게), 앱 셸은 네트워크 우선(4초 넘으면 캐시), SDK·아이콘은 캐시 우선, 다른 출처는 가로채지 않음 |
| `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png` | 홈 화면 설치용. 아이콘은 `any`·`maskable` 겸용(가운데 안전 영역 안에 그림) |
| `firestore.rules` | Firestore 보안 규칙 (허용 UID, 항목 검증). 저장소에 두고 콘솔에 붙여넣어 게시 |

| 구역 주석 | 내용 |
|---|---|
| (상단 상수) | `STORAGE_KEY`(v3), `LEGACY_STORAGE_KEY`(v2), `THEME_KEY`, `MAX_*_LENGTH`(규칙과 같은 길이 제한), `FIREBASE_CONFIG`, `FIREBASE_SDK_URL`(버전 고정), 시드 데이터로 `bookmarks` 초기화, `store` 생성 |
| `데이터 검증 및 불러오기` | `isSafeUrl`, `truncateText`, `normalizeBookmark`, `generateId`, `sanitizeBookmarks`, `loadBookmarks` (v2 → v3 마이그레이션, 시드는 복사본) |
| `저장소 및 상태 작업` | `createLocalStore`(`store`), 작업 함수 `addBookmark` / `updateBookmark` / `removeBookmark` / `moveBookmark` / `replaceAll` / `mergeAll` |
| `로그인 및 클라우드 동기화` | `initCloud`(SDK 동적 import, 10초 제한), `setCloudLoading`(불러오는 중, K-16), `login`/`logout`/`toggleAuth`, `updateSyncStatus`/`watchPendingWrites`(동기화 상태), `enterCloudMode`/`leaveCloudMode`(스냅샷 리스너), `offerLocalMigration`, `createCloudStore`(`order`로 순서 저장) |
| `다크 모드` | `initTheme` / `applyTheme` / `toggleTheme` (저장은 `toggleTheme`에서만) |
| `파비콘 및 렌더링` | `getFaviconUrl`, `getVisibleBookmarks`(검색·필터), `renderBookmarks` (그리드 전체 재생성) |
| `드래그 앤 드롭` | `setupDragEvents`, `moveBookmarkBy` (이동 버튼) |
| `카테고리 필터 관리` | `updateCategoryOptions` |
| `모달 및 CRUD` | 모달 열기/닫기, Esc 처리, `saveBookmark`(`<form>` submit), `editBookmark`, `deleteBookmark` |
| `HTML 북마크 내보내기` | `EXPORT_DEFAULT_FOLDER`(카테고리 없는 항목의 폴더), `exportHTML` (Netscape 형식), `downloadFile` |
| `JSON 백업 / 복구` | `exportJSON`, `importJSON`([📂 가져오기]. 파일을 JSON 백업과 북마크 HTML로 가려 분기), `escapeHtml` |
| `브라우저 북마크 가져오기` | `isBookmarkHtml`, `parseBrowserBookmarks`(`DOMParser`, `folderCategory`로 폴더 → 카테고리), `urlKey`(같은 주소 판별), `importBrowserBookmarks`(중복 건너뛰고 `mergeAll`) (D-024) |
| (끝) | 초기화, `online`/`offline` 이벤트, 서비스 워커 등록 |

## 작성 규약

### 원칙
- **빌드 없음. 정적 파일 몇 개. 외부 코드는 버전 고정한 Firebase SDK만 (D-017).** 다른 라이브러리·CDN·빌드 도구가 필요하면 먼저 사용자와 상의하고 DECISIONS.md에 결정을 추가한다.
- 새 외부 네트워크 요청을 추가하지 않는다. 허용: 파비콘(D-008), `www.gstatic.com/firebasejs/`, Firebase SDK가 스스로 하는 Auth·Firestore 통신.
- Firebase SDK는 **동적 `import()`**로 불러온다. 불러오지 못하거나 `file://`로 열어도 로컬 모드로 동작해야 한다. SDK 버전을 올리면 세 파일(`firebase-app/auth/firestore.js`)을 같은 버전으로 맞추고, `index.html`의 `FIREBASE_SDK_URL`과 `sw.js`의 `SDK_BASE`를 함께 고친다.
- 앱 파일(`index.html`, `sw.js`, 매니페스트, 아이콘)을 바꿔 릴리스할 때는 `sw.js`의 `CACHE_NAME`을 올린다. 캐시할 파일을 추가하면 `sw.js`의 `APP_SHELL`에도 넣는다.
- 앱 안의 경로는 상대 경로로 쓰고, 호스팅 전용 기능(주소 다시 쓰기·응답 헤더·리디렉트 설정)에 의존하지 않는다.
- 요청받은 범위만 고친다. 김에 리팩터링하지 않는다.

### JavaScript
- `const`/`let`만 쓴다. 함수는 `function` 선언, 이름은 camelCase, 상수는 `UPPER_SNAKE_CASE`.
- 상태는 전역 배열 `bookmarks` 하나다. **상태 변경은 작업 함수(`addBookmark` 등)로만 한다** — 작업 함수가 배열을 바꾸고, 다시 그린 뒤, 저장을 `store`에 맡기는 유일한 경로다. 작업 함수 밖에서 `bookmarks`를 바꾸거나 `localStorage`에 목록을 직접 쓰지 않는다.
- ID는 `number`로 유지하고 `===`로 비교한다. 외부에서 들어온 ID는 숫자로 정규화한다. 새 ID는 `generateId`로만 만든다.
- **사용자·외부 데이터를 HTML 문자열에 넣을 때는 항상 `escapeHtml()`을 거친다.** 텍스트 노드뿐 아니라 `href`, `title`, `src` 등 **속성값도 포함**한다. 가능하면 `textContent`/`setAttribute`를 쓴다.
- `href`에 들어갈 URL은 `http:`/`https:` 스킴만 허용한다.
- 인라인 `onclick="…"` 안에 데이터 값을 끼워 넣지 않는다. 새 코드는 `addEventListener` 또는 `data-*` 속성 + 위임으로 연결한다.
- `localStorage`, 가져온 JSON, **Firestore 스냅샷**은 신뢰하지 않는다: 파싱을 `try`로 감싸고, 항목마다 `normalizeBookmark`로 검사한다.
- 길이 제한 등 검증 조건을 바꾸면 `firestore.rules`도 같이 고친다 (다르면 앱에서는 저장됐는데 서버가 거부한다). 규칙을 바꾸면 사용자에게 콘솔 게시를 요청한다.
- Firestore 쓰기의 Promise는 `await`하지 않는다 (오프라인에서는 끝나지 않음). 오류는 `.catch`로 받아 알린다.
- 저장 형식(항목 필드, 키)을 바꾸면 `STORAGE_KEY`의 버전을 올리고 이전 키에서 옮기는 마이그레이션을 넣는다. **이전 JSON 백업 파일도 계속 복구할 수 있어야 한다.**
- 주석과 구역 구분(`/* ---------- 제목 ---------- */`)은 한국어로 쓰고, 기존 밀도에 맞춘다(무엇이 아니라 왜를 설명할 때만).

### CSS / 마크업
- 색·그림자는 CSS 변수로만 쓴다. **새 변수는 `:root`와 `[data-theme="dark"]` 양쪽에 정의**한다. 하드코딩 색은 기존 예외(주 버튼의 `white`, 모달 오버레이)만 허용.
- 클래스명은 kebab-case. 들여쓰기 2칸.
- 360px 폭에서 가로 스크롤이 생기지 않게 한다 (`flex-wrap`, `min-width: 0` 패턴 유지).
- UI 문구는 한국어, 코드 식별자는 영어.

### 파일 인코딩 (Windows)
- 모든 파일은 **UTF-8(BOM 없음)**. PowerShell `Get-Content`로 출력하면 한글이 깨져 보이지만 파일은 정상이다 — Read 도구를 쓰거나 `-Encoding utf8`을 붙인다.
- `Set-Content`/`Add-Content`로 파일을 쓰지 않는다 (ANSI로 저장돼 한글이 깨진다). Edit/Write 도구를 쓴다.

### 문서와 커밋
- 설계에 영향을 주는 변경(저장 형식, 데이터 모델, 외부 요청, 의존성, 주요 UX 규칙)은 DECISIONS.md 4장에 결정을 추가한다.
- 알려진 문제를 고치면 DECISIONS.md 5장의 상태를 `해결 (커밋 해시)`로 바꾼다. 새로 발견한 문제는 K-NN으로 추가한다.
- 기능이 추가·변경되면 DECISIONS.md 2장 기능 목록과 README를 함께 고친다.
- 커밋 메시지는 한국어 한 줄 요약(예: `JSON 복구 시 항목 검증 추가 (K-04)`). 버전 릴리스 커밋만 `vX.Y`. 커밋은 사용자가 요청할 때만 한다.
- GitHub Pages가 `main`을 자동 배포하므로 작업은 브랜치에서 하고 PR로 머지한다. 폰에서 확인할 때는 README의 "폰 테스트" 절차(Pages 브랜치 전환)를 따르고, 끝나면 `main`으로 되돌렸는지 확인한다.

## 코드 점검 규약

변경을 마쳤거나 점검을 요청받으면 아래 순서로 확인한다. 자동 테스트가 없으므로 **브라우저에서 직접 실행해 확인한 것만 "확인됨"이라고 보고**한다. 테스트는 로컬 서버(`http://localhost:포트`)에서 한다 — `file://`로는 로그인·동기화를 확인할 수 없다. 로그인은 사용자가 직접 한다.

### 1. 체크리스트
- [ ] **XSS:** 사용자·외부 데이터가 `innerHTML`·템플릿 문자열·속성·인라인 핸들러에 들어가는 모든 지점이 이스케이프되거나 `textContent`를 쓰는가
- [ ] **URL:** 링크로 쓰이는 URL이 모달 입력, JSON 복구, 북마크 HTML 가져오기 모두에서 `http(s)`만 허용되는가
- [ ] **상태 경로:** `bookmarks`를 바꾸는 코드가 작업 함수 안에만 있고, 작업 함수마다 다시 그리기와 `store` 호출이 있는가
- [ ] **외부 입력:** 깨진 JSON, 배열 아님, 필드 누락, 문자열 ID, 중복 ID를 넣어도 앱이 멈추지 않는가
- [ ] **호환성:** 기존 `localStorage` 데이터와 기존 JSON 백업을 그대로 읽는가
- [ ] **테마:** 새 색이 두 테마 모두 정의됐고, 다크 모드에서 글자가 읽히는가
- [ ] **반응형:** 360px 폭에서 가로 스크롤이 없는가
- [ ] **의존성:** 허용 목록 밖의 외부 요청·라이브러리가 없는가
- [ ] **두 모드:** 로컬 모드와 클라우드 모드에서 모두 동작하고, Firebase를 불러오지 못해도 로컬 모드로 동작하는가
- [ ] **콘솔:** 브라우저 콘솔에 오류가 없는가
- [ ] **문서:** DECISIONS.md(결정·기능·알려진 문제)가 변경과 일치하는가

### 2. 수동 회귀 테스트
`http://localhost:포트`에서, 로그아웃 상태로 개발자 도구에서 `localStorage.clear()` 후 새로고침해 깨끗한 상태로 시작한다. 1~11은 로컬 모드, 12~17은 클라우드 모드다. 클라우드 테스트는 사용자 계정의 실제 데이터에 쓰므로 **이름으로 구별되는 테스트 항목만** 만들고 지우며, 덮어쓰기 복구는 하지 않는다(사용자가 허락한 경우 제외).

1. 시드 북마크 3개가 보인다.
2. 추가: `example.com` 입력 후 Enter → `https://example.com`으로 저장, 목록 맨 앞에 나타남. 빈 칸으로 Enter → 저장되지 않음. Esc → 모달이 닫힘.
3. 수정 → 값이 바뀜. 삭제 → 확인 후 사라짐.
4. 검색(제목·URL), 카테고리 필터가 동작한다. 필터 중 그 카테고리의 마지막 항목을 지우면 필터가 '전체'로 돌아간다.
5. 드래그와 [←]/[→] 버튼으로 순서 변경 → 새로고침 후에도 유지. 필터 중 이동도 확인.
6. 테마: 전환하기 전에는 OS 설정을 따르고 저장하지 않는다. 전환 → 새로고침 후에도 유지.
7. HTML 내보내기 → 크롬 등에서 가져오면 카테고리가 폴더로 보이고, 새로 추가한 북마크의 추가 시각이 맞다.
8. JSON 백업 → [📂 가져오기]로 복구: [확인]은 덮어쓰기, [취소]는 병합. 같은 파일을 두 번 병합한 뒤 하나를 지워도 하나만 사라진다.
9. 잘못된 파일(배열 아닌 JSON, 텍스트 파일, 빈 HTML 파일, 북마크 없는 HTML) 가져오기 → 알림 후 앱이 정상 동작.
10. 브라우저 북마크 가져오기: 크롬 등에서 내보낸 북마크 HTML을 [📂 가져오기] → 가져올 개수 확인 후 목록 맨 앞에 추가. 폴더가 카테고리가 되고(가장 안쪽 폴더, `북마크바`·`기타 북마크` 등 최상위 폴더는 제외), 추가 시각이 브라우저와 같다. `javascript:` 주소는 건너뛴다. 같은 파일을 다시 가져오면 "새로 가져올 북마크가 없습니다". 7에서 내보낸 파일을 빈 목록에 가져오면 카테고리가 그대로 돌아온다.
11. 마이그레이션: `single_file_bookmarks_v2`에만 데이터를 넣고 새로고침 → 같은 목록이 보이고 v3 키가 생긴다.
12. 로그인(사용자가 직접): 헤더에 계정과 `✓ 동기화됨`. 로컬에 사용자 데이터가 있고 처음 로그인하는 기기면 올릴지 묻는다.
13. 클라우드에서 추가·수정·삭제·이동·북마크 HTML 가져오기 → 서버 순서까지 반영(`getDocsFromServer`로 확인). 이동 버튼 포커스 유지.
14. 다른 기기의 변경 반영: 같은 계정의 다른 브라우저(또는 REST API로 직접 쓰기)에서 바꾼 내용이 몇 초 안에 화면에 보인다.
15. 오프라인: `disableNetwork` 상태에서 추가 → 1초 뒤 `⬆ 올릴 변경 있음`, `enableNetwork` 후 `✓ 동기화됨`과 서버 반영. 그 상태로 로그아웃하면 경고가 뜬다.
16. 로그인 상태로 새로고침 → 로컬 목록 대신 "계정 목록을 불러오는 중…" 뒤 계정 목록. 로컬 서버를 멈추고 새로고침해도 서비스 워커 캐시로 열리고 계정 목록이 보인다.
17. 로그아웃 → 로그인 전 로컬 목록으로 돌아가고 로그인 버튼이 보인다. SDK 주소를 잘못된 버전으로 바꾼 사본을 열면 로그인 버튼 없이 로컬 모드로 동작한다.

### 3. 보고 형식
문제마다 다음을 적는다. 이번에 고치지 않는 문제는 DECISIONS.md 5장에 추가한다.

- **심각도:** 높음(보안·데이터 손실·앱 정지) / 중간(기능 오동작) / 낮음(불편·일관성)
- **위치:** `index.html:줄번호` 또는 함수 이름
- **재현:** 입력과 절차 → 실제 결과 / 기대 결과
- **수정 제안**
