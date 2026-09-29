# CLAUDE.md

단일 HTML 파일 북마크 관리자. 빌드·패키지·자동 테스트가 없고, `index.html`을 브라우저로 열면 실행된다.

- 기능 목록, 데이터 모델, 설계 결정(D-NNN), 알려진 문제(K-NN): [docs/DECISIONS.md](docs/DECISIONS.md) — **작업 전에 읽는다.**
- 진행 중인 설계: 여러 기기 동기화(Firebase) [docs/SYNC-DESIGN.md](docs/SYNC-DESIGN.md) — 단계별로 구현한다(6장). 설계가 확정되기 전에는 아래 규약이 그대로 적용된다.

## 구조

`index.html` 한 파일에 `<style>` → 마크업 → `<script>` 순서로 들어 있다. 스크립트는 주석으로 구역을 나눈다.

| 구역 주석 | 내용 |
|---|---|
| (상단 상수) | `STORAGE_KEY`(v3), `LEGACY_STORAGE_KEY`(v2), `THEME_KEY`, 시드 데이터로 `bookmarks` 초기화 |
| `데이터 검증 및 불러오기` | `isSafeUrl`, `normalizeBookmark`, `sanitizeBookmarks`, `loadBookmarks` (v2 → v3 마이그레이션) |
| `다크 모드` | `initTheme` / `applyTheme` / `toggleTheme` (저장은 `toggleTheme`에서만) |
| `파비콘 및 렌더링` | `getFaviconUrl`, `getVisibleBookmarks`(검색·필터), `renderBookmarks` (그리드 전체 재생성) |
| `드래그 앤 드롭` | `setupDragEvents`, `moveBookmark` (이동 버튼) |
| `카테고리 필터 관리` | `updateCategoryOptions` |
| `모달 및 CRUD` | 모달 열기/닫기, Esc 처리, `saveBookmark`(`<form>` submit), `editBookmark`, `deleteBookmark`, `syncAndRender` |
| `HTML 북마크 내보내기` | `exportHTML` (Netscape 형식), `downloadFile` |
| `JSON 백업 / 복구` | `exportJSON`, `importJSON`, `escapeHtml` |

## 작성 규약

### 원칙
- **단일 파일, 외부 의존성 없음(D-001)을 지킨다.** 라이브러리·CDN·빌드 도구·파일 분리가 필요하면 먼저 사용자와 상의하고 DECISIONS.md에 결정을 추가한다.
- 새 외부 네트워크 요청을 추가하지 않는다 (현재 예외는 파비콘 하나, D-008).
- 요청받은 범위만 고친다. 김에 리팩터링하지 않는다.

### JavaScript
- `const`/`let`만 쓴다. 함수는 `function` 선언, 이름은 camelCase, 상수는 `UPPER_SNAKE_CASE`.
- 상태는 전역 배열 `bookmarks` 하나다. **상태를 바꾼 뒤에는 반드시 `syncAndRender()`를 호출**한다 — 저장과 렌더링의 유일한 경로다.
- ID는 `number`로 유지하고 `===`로 비교한다. 외부에서 들어온 ID는 숫자로 정규화한다.
- **사용자·외부 데이터를 HTML 문자열에 넣을 때는 항상 `escapeHtml()`을 거친다.** 텍스트 노드뿐 아니라 `href`, `title`, `src` 등 **속성값도 포함**한다. 가능하면 `textContent`/`setAttribute`를 쓴다.
- `href`에 들어갈 URL은 `http:`/`https:` 스킴만 허용한다.
- 인라인 `onclick="…"` 안에 데이터 값을 끼워 넣지 않는다. 새 코드는 `addEventListener` 또는 `data-*` 속성 + 위임으로 연결한다.
- `localStorage`와 가져온 JSON은 신뢰하지 않는다: 파싱을 `try`로 감싸고, 항목마다 `title`/`url` 타입을 검사한다.
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

## 코드 점검 규약

변경을 마쳤거나 점검을 요청받으면 아래 순서로 확인한다. 자동 테스트가 없으므로 **브라우저에서 직접 실행해 확인한 것만 "확인됨"이라고 보고**한다.

### 1. 체크리스트
- [ ] **XSS:** 사용자·외부 데이터가 `innerHTML`·템플릿 문자열·속성·인라인 핸들러에 들어가는 모든 지점이 이스케이프되거나 `textContent`를 쓰는가
- [ ] **URL:** 링크로 쓰이는 URL이 모달 입력과 JSON 복구 양쪽에서 `http(s)`만 허용되는가
- [ ] **상태 경로:** `bookmarks`를 바꾸는 모든 코드가 `syncAndRender()`로 끝나는가
- [ ] **외부 입력:** 깨진 JSON, 배열 아님, 필드 누락, 문자열 ID, 중복 ID를 넣어도 앱이 멈추지 않는가
- [ ] **호환성:** 기존 `localStorage` 데이터와 기존 JSON 백업을 그대로 읽는가
- [ ] **테마:** 새 색이 두 테마 모두 정의됐고, 다크 모드에서 글자가 읽히는가
- [ ] **반응형:** 360px 폭에서 가로 스크롤이 없는가
- [ ] **의존성:** 새 외부 요청·라이브러리가 없는가
- [ ] **콘솔:** 브라우저 콘솔에 오류가 없는가
- [ ] **문서:** DECISIONS.md(결정·기능·알려진 문제)가 변경과 일치하는가

### 2. 수동 회귀 테스트
개발자 도구에서 `localStorage.clear()` 후 새로고침해 깨끗한 상태로 시작한다.

1. 시드 북마크 3개가 보인다.
2. 추가: `example.com` 입력 후 Enter → `https://example.com`으로 저장, 목록 맨 앞에 나타남. 빈 칸으로 Enter → 저장되지 않음. Esc → 모달이 닫힘.
3. 수정 → 값이 바뀜. 삭제 → 확인 후 사라짐.
4. 검색(제목·URL), 카테고리 필터가 동작한다. 필터 중 그 카테고리의 마지막 항목을 지우면 필터가 '전체'로 돌아간다.
5. 드래그와 [←]/[→] 버튼으로 순서 변경 → 새로고침 후에도 유지. 필터 중 이동도 확인.
6. 테마: 전환하기 전에는 OS 설정을 따르고 저장하지 않는다. 전환 → 새로고침 후에도 유지.
7. HTML 내보내기 → 크롬 등에서 가져오면 카테고리가 폴더로 보이고, 새로 추가한 북마크의 추가 시각이 맞다.
8. JSON 백업 → 복구: [확인]은 덮어쓰기, [취소]는 병합. 같은 파일을 두 번 병합한 뒤 하나를 지워도 하나만 사라진다.
9. 잘못된 파일(배열 아닌 JSON, 텍스트 파일) 복구 → 오류 알림 후 앱이 정상 동작.
10. 마이그레이션: `single_file_bookmarks_v2`에만 데이터를 넣고 새로고침 → 같은 목록이 보이고 v3 키가 생긴다.

### 3. 보고 형식
문제마다 다음을 적는다. 이번에 고치지 않는 문제는 DECISIONS.md 5장에 추가한다.

- **심각도:** 높음(보안·데이터 손실·앱 정지) / 중간(기능 오동작) / 낮음(불편·일관성)
- **위치:** `index.html:줄번호` 또는 함수 이름
- **재현:** 입력과 절차 → 실제 결과 / 기대 결과
- **수정 제안**
