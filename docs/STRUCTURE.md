# index.html 구조

`index.html`의 `<script>`를 나눈 구역 주석(`/* ---------- 제목 ---------- */`)과 각 구역의 내용. 파일별 내용은 [CLAUDE.md](../CLAUDE.md) 「구조」에 있다.

| 구역 주석 | 내용 |
|---|---|
| (상단 상수) | `STORAGE_KEY`(v3), `LEGACY_STORAGE_KEY`(v2), `THEME_KEY`, `MAX_*_LENGTH`(규칙과 같은 길이 제한), `CLOUD_COPY_KEY_PREFIX`·`CLOUD_COPY_VERSION`(계정 목록 사본), `DEFAULT_FIREBASE_CONFIG`(기본 설정)·`FIREBASE_REQUIRED_KEYS`, `FIREBASE_CONFIG`(= `resolveFirebaseConfig()`, `null`이면 클라우드 끔), `FIREBASE_SDK_URL`(버전 고정), 클라우드를 껐으면 남은 사본 지우기, `bookmarks` 초기화(로컬 목록, 로그인한 채로 닫았으면 사본 `bootCopy`), `store` 생성 |
| `데이터 검증 및 불러오기` | `isSafeUrl`, `truncateText`, `normalizeBookmark`, `generateId`, `sanitizeBookmarks`, `loadBookmarks` (v2 → v3 마이그레이션, 시드는 복사본), `loadCloudCopy`(사본 검증, 하나라도 잘못되면 버림) |
| `저장소 및 상태 작업` | `createLocalStore`(`store`), 작업 함수 `addBookmark` / `updateBookmark` / `removeBookmark` / `moveBookmark` / `replaceAll` / `mergeAll` |
| `로그인 및 클라우드 동기화` | 주기 상수(`FULL_SYNC_INTERVAL_DAYS`, `TOMBSTONE_KEEP_DAYS`), `resolveFirebaseConfig`·`isAppConfigDeclared`(쓸 설정, D-026), `isServedOverHttp`/`canUseCloud`(서비스 워커는 앞의 것만), `initCloud`(SDK 동적 import, 10초 제한), `setCloudLoading`(계정 준비 전 잠금, K-16), `waitForSync`, `login`/`logout`/`toggleAuth`, `updateSyncStatus`/`watchPendingWrites`(동기화 상태), `enterCloudMode` → `startCloudSync`(필요하면 전체 받기 → 바뀐 것 구독, D-025) / `leaveCloudMode`, `showCloudList`(원격 변경을 화면에), `forgetCloudCopy`(표시 키와 사본 지우기), `offerLocalMigration`, `cleanTombstones`(묘비 비우기), `createCloudStore`(`order`로 순서 저장, 묘비 삭제, 사본 저장, `fetchAll`·`applyChanges`) |
| `다크 모드` | `initTheme` / `applyTheme` / `toggleTheme` (저장은 `toggleTheme`에서만) |
| `파비콘 및 렌더링` | `getFaviconUrl`, `getVisibleBookmarks`(검색·필터), `renderBookmarks` (그리드 전체 재생성, 계정 준비 전에는 카드 버튼·드래그 잠금) |
| `드래그 앤 드롭` | `setupDragEvents`, `moveBookmarkBy` (이동 버튼) |
| `카테고리 필터 관리` | `updateCategoryOptions` |
| `모달 및 CRUD` | 모달 열기/닫기, Esc 처리, `saveBookmark`(`<form>` submit), `editBookmark`, `deleteBookmark` |
| `HTML 북마크 내보내기` | `EXPORT_DEFAULT_FOLDER`(카테고리 없는 항목의 폴더), `EXPORT_GENERATOR`(이 앱이 내보낸 파일 표시), `exportHTML` (Netscape 형식), `downloadFile` |
| `JSON 백업 / 복구` | `exportJSON`, `importJSON`([📂 가져오기]. 파일을 JSON 백업과 북마크 HTML로 가려 분기), `escapeHtml` |
| `브라우저 북마크 가져오기` | `isBookmarkHtml`, `parseBrowserBookmarks`(`DOMParser`, `folderCategory`로 폴더 → 카테고리), `urlKey`(같은 주소 판별), `importBrowserBookmarks`(중복 건너뛰고 `mergeAll`) (D-024) |
| (끝) | 초기화, `online`/`offline` 이벤트, 서비스 워커 등록 |
