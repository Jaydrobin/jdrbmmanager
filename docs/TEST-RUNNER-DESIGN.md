# 자동 회귀 시험 설계

- **상태:** 확정 (2026-10-22). 8장에 확정한 답을 적었다. 7장의 단계 순서대로 구현한다.
- **수명:** 구현을 위한 임시 문서다. 마지막 단계(7장 4단계)에서 필요한 내용을 DECISIONS.md·CLAUDE.md·README로 옮기고 **이 문서는 삭제한다.**
- **기준 코드:** v0.8.2 (커밋 `b799360`). 함수 이름은 이 시점 `index.html`·`sw.js` 기준.
- **관련 결정:** K-23(이 설계로 해결), D-027(새로 추가). 바탕은 D-012(전역 함수), D-013(`alert`·`confirm`), D-014(외부 입력 검증), D-017·D-018(의존성·외부 요청), D-019(두 모드), D-022(서비스 워커), D-023(같은 출처 공유), D-026(`config.js`).

---

## 1. 요구사항과 범위

| 요구사항 | 내용 |
|---|---|
| 명령 하나 | 작성 세션이 명령 하나로 회귀 시험을 돌려 `통과 n/전체 m`과 실패 목록을 받는다. 실패가 있으면 종료 코드가 0이 아니다 |
| 의존성 없음 | 빌드·패키지·라이브러리·CDN 없음. 새 외부 네트워크 요청 없음 (D-017, D-018) |
| 데이터 분리 | 사용자의 실제 앱 데이터(앱 출처의 `localStorage`, Firestore)와 섞이지 않는다. 별도 포트(다른 출처)에서 돌고, 시험 중 Firebase에 접속하지 않는다. 저장소의 `config.js`는 바꾸지 않는다 |
| 앱 변경 최소 | `index.html`은 시험을 위해 꼭 필요한 만큼만 바꾼다 → **이 설계는 바꾸지 않는다** (3.2) |
| 잡아내는지 확인 | 검사를 잠시 빼면 시험이 실패하는지 확인할 수 있다 (3.8) |

**하지 않는 것**
- 클라우드 모드(회귀 12~21)의 자동화. 실제 계정·Firestore·로그인이 필요하다. 지금처럼 수동(사용자가 확인할 항목)으로 남긴다.
- 사람이 봐야 하는 확인: 대화상자의 모양·문구 읽기, OS 파일 선택 창, 실제로 저장된 다운로드 파일, 크롬에서 내보낸 HTML 가져오기, 다크 모드 가독성, 앱이 열린 동안 OS 테마 바꾸기.
- 시험 프레임워크·단언 라이브러리 도입. 필요한 만큼의 작은 하네스를 직접 쓴다.

## 2. 방식 비교

이 PC(Windows 11, Git Bash)에서 확인한 사실 (2026-10-22):
- 브라우저: 크롬 155 `C:\Program Files\Google\Chrome\Application\chrome.exe`, 엣지 155 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- 런타임: Node v24.19.0 (`C:\Program Files\nodejs\node`). `python`은 Microsoft Store 바로 가기뿐이라 실행되지 않는다(설치 안 됨).
- 시험 페이지가 비동기 작업(타이머·`fetch`) 뒤에 결과를 쓰게 한 실험:
  - `chrome --headless=new --dump-dom <URL>` → 비동기 작업이 끝나기 **전의** DOM(`running`)이 나온다.
  - 같은 명령에 `--virtual-time-budget=10000` → 끝난 결과가 나온다. 단 가상 시간은 타이머와 `Date.now()`를 앞당겨 실제와 다르게 흐른다(앱은 ID·추가 시각에 `Date.now()`를 쓴다).
  - `msedge --headless=new --virtual-time-budget=10000 --dump-dom <URL>` → 종료 코드 0인데 표준 출력이 비어 있었다.
  - 시험 페이지가 결과를 같은 출처 서버로 `POST`하게 하면 크롬·엣지 모두 결과를 받았다.

| 방식 | 내용 | 장점 | 대가 |
|---|---|---|---|
| **A. `--dump-dom` (K-23 제안)** | 정적 서버를 따로 띄우고 `chrome --headless=new --virtual-time-budget=N --dump-dom http://localhost:<포트>/tests/run.html`. 출력 DOM에서 결과 줄을 `grep` | 브라우저만 있으면 됨 | 서버를 띄우고 끄는 명령이 따로 필요(이 PC엔 Python이 없음). 끝나는 시점을 가상 시간에 맡김. 엣지에서는 출력이 없었음 |
| **B. Node 러너 (권장)** | `node tests/run.mjs` 하나가 ① 저장소를 `127.0.0.1:8766`에 정적으로 서비스하고 ② 임시 프로필로 헤드리스 크롬(없으면 엣지)을 띄워 `tests/run.html?report`를 열고 ③ 페이지가 `POST /__result`로 보낸 결과를 받아 출력한 뒤 ④ 브라우저·서버·임시 프로필을 정리 | 명령 하나. 끝나는 시점이 정확(결과를 받으면 끝). 실제 시간으로 돈다. 크롬·엣지 모두 동작. 구조화된 결과 | Node가 필요(앱은 쓰지 않고 시험에만, **내장 모듈만**). 러너 코드 약 100줄 |
| C. CDP 직접 | 원격 디버깅 포트에 Node 내장 `WebSocket`으로 붙어 콘솔·네트워크까지 읽음 | 가장 많이 볼 수 있음 | 프로토콜 코드가 길고 브라우저 버전에 민감. B로 충분 |
| D. Playwright·jsdom 등 | npm 패키지 | 도구가 풍부 | 패키지 의존성 — 원칙 위반(D-017) |

**권장: B.** 결과 화면은 `tests/run.html` 자체에도 그리므로, 같은 서버를 띄운 채(`node tests/run.mjs --serve`) 보통 브라우저로 열어 실패를 들여다볼 수 있다. Node는 앱의 의존성이 아니라 시험 도구이며, CLAUDE.md 코드 점검 규약 0절이 이미 점검에 Node를 쓴다. 그래도 "빌드 도구 등은 상의 후 결정" 원칙(CLAUDE.md)에 따라 8장 Q1로 묻고 D-027에 적는다.

## 3. 설계

### 3.1 파일

| 파일 | 내용 |
|---|---|
| `tests/run.mjs` | 러너. Node 내장 모듈(`node:http`, `node:fs`, `node:path`, `node:os`, `node:child_process`)만 쓴다 |
| `tests/run.html` | 하네스와 결과 화면. 출처 가드(3.6), 앱 인스턴스 만들기(3.2), 기록기(3.4), 실행·보고 |
| `tests/cases.js` | 시험 목록. 회귀 번호별로 묶는다(4장). 픽스처(크롬 형식 북마크 HTML 등)는 이 파일 안의 문자열 |

시험 파일은 앱 파일이 아니다: `sw.js`의 `APP_SHELL`에 넣지 않고, 시험만 바꾼 변경은 `CACHE_NAME`을 올리지 않는다.

### 3.2 앱 인스턴스: `srcdoc` iframe에 `index.html`을 주입

`run.html`은 `fetch('../index.html', { cache: 'no-store' })`로 앱 원문을 받아 아래 네 곳을 덧붙인 뒤 `iframe.srcdoc`으로 연다. 시험마다 새 iframe(= 새 앱 인스턴스)을 만들고, "새로고침"은 같은 `localStorage`로 iframe을 다시 만드는 것이다.

1. `<head>` 바로 뒤: `<base href="<저장소 루트 절대 주소>">` — 상대 경로(`config.js`, `manifest.webmanifest`, 아이콘)가 저장소 루트에서 풀리게.
2. 그 뒤: CSP `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:">` — 3.3.
3. 그 뒤: 기록기 스크립트 — 3.4.
4. 앱 `</script>` 뒤: 상태 접근 스크립트 — 아래.

**최상위 `let`/`const`에 닿기.** `bookmarks`, `store`, `cloudLoading`, `FIREBASE_CONFIG` 등 최상위 `let`/`const`는 전역 렉시컬 환경에 있어 `window`의 속성이 아니다(실험: `iframe.contentWindow.bookmarks`는 `undefined`). 같은 문서의 **다른 일반 스크립트는 전역 렉시컬 환경을 공유**하므로, 앱 스크립트 뒤에 붙인 스크립트의 getter는 호출할 때 그 이름을 찾는다(실험으로 확인).

```html
<script>
  window.__app = {
    get bookmarks() { return bookmarks; },
    get cloudLoading() { return cloudLoading; },
    get firebaseConfig() { return FIREBASE_CONFIG; },
    get firebase() { return firebase; },
    keys: { STORAGE_KEY, LEGACY_STORAGE_KEY, THEME_KEY, CLOUD_HINT_KEY, CLOUD_COPY_KEY_PREFIX }
  };
</script>
```

- 함수 선언(`renderBookmarks`, `importJSON` 등)은 D-012대로 `window`의 속성이라 그대로 부른다.
- `contentWindow.eval('bookmarks')`도 같은 일을 하지만 CSP에 `'unsafe-eval'`이 필요해 쓰지 않는다.
- 앱의 이름이 바뀌면 getter가 `ReferenceError`를 던져 해당 시험이 실패한다(조용히 지나가지 않음).
- **시험은 상태를 직접 바꾸지 않는다.** 화면 조작(클릭, 폼 제출, 파일 입력)이나 앱의 전역 함수로만 바꾸고, `__app`은 읽기에만 쓴다. 그래야 "작업 함수 → 다시 그리기 → `store`" 경로(CLAUDE.md)를 시험이 함께 지난다.

**왜 앱을 바꾸지 않아도 되는가.** `srcdoc` 문서의 `location.protocol`은 `about:`이다(실험으로 확인). 그래서 `isServedOverHttp()`가 `false` → `canUseCloud()`가 `false` → `initCloud()`가 곧바로 돌아가고 Firebase SDK를 불러오지 않으며, 서비스 워커도 등록하지 않는다. 출처는 부모(`http://127.0.0.1:8766`)를 물려받아 `localStorage`는 시험 출처의 것을 쓴다. 비교한 다른 방법:

| 방법 | 앱 변경 | 문제 |
|---|---|---|
| **`srcdoc` 주입 (권장)** | 없음 | 클라우드를 켤 수 있는 분기(`canUseCloud()`가 참)는 시험할 수 없음 — 어차피 수동(12~21) |
| iframe으로 `../index.html`을 그대로 열기 | 시험 표시(`?test` 등)를 읽어 클라우드를 끄는 코드 필요 | 저장소의 `config.js`(템플릿 → 기본 설정)를 읽어 SDK를 받고 Firebase에 접속함. 서비스 워커가 시험 출처 루트(`/`)에 등록돼 `run.html`까지 가로챔 |
| 앱에 시험용 전역 노출(`window.__test = …`) | 있음 | 배포되는 앱 코드에 시험 코드가 섞임 |

### 3.3 시험 중 외부 요청 막기

- `srcdoc`이라 클라우드가 꺼지는 것(3.2)에 더해, 주입한 CSP가 **같은 출처 밖의 모든 요청**을 막는다: Firebase SDK(`www.gstatic.com`), 파비콘(`www.google.com/s2/favicons`, D-008)이 모두 막힌다(실험: 파비콘 `<img>`가 `onerror`로 감). 시험 데이터의 도메인이 Google로 가지 않는다.
- 기록기가 `securitypolicyviolation` 이벤트로 막힌 주소를 모은다. **공통 검사:** 막힌 주소는 파비콘 주소뿐이어야 한다. 앱이 허용 목록 밖의 외부 요청을 새로 하면 이 검사가 잡는다(체크리스트 "의존성").
- 러너가 띄우는 브라우저는 `--disable-background-networking --disable-component-update --disable-sync --no-first-run`으로 브라우저 자체의 백그라운드 요청도 줄인다.
- `config.js`: 기본 시험은 **저장소의 `config.js`를 그대로** 불러온다(읽기만). 겹치는 최상위 선언처럼 앱 스크립트를 멈추게 하는 `config.js`면 시험이 실패한다. 설정 판정 시험(4장 22~24)만 `<script src="config.js"></script>` 태그를 그 시험의 내용으로 바꾼 인라인 스크립트로 갈아 끼운다. 바꿀 태그를 원문에서 찾지 못하면 하네스 오류(실패)로 보고한다.

### 3.4 사람이 조작하는 부분 다루기

`<head>`에 주입하는 기록기 스크립트(앱 스크립트보다 먼저 실행):

| 대상 | 다루는 방법 |
|---|---|
| `alert`, `confirm`, `prompt` | `window`의 속성이라 덮어쓸 수 있다. 메시지를 `__dialogs`에 기록. `confirm`은 시험이 넣어 둔 답 큐 `__confirmAnswers`에서 꺼내고, **큐가 비면 `false`(취소)** — 예상하지 못한 확인이 덮어쓰기 같은 동작을 하지 않게 |
| 콘솔·예외 | `console.error`·`console.warn` 호출, `error`·`unhandledrejection` 이벤트를 기록. **공통 검사:** 시험이 기대한 것 말고 오류·예외가 없다(체크리스트 "콘솔") |
| 파일 입력 | `new DataTransfer()`에 `File`을 넣어 `#fileInput.files`에 대입하고 `change` 이벤트를 보낸다 → 마크업의 `onchange="importJSON(event)"`가 그대로 실행된다. `FileReader`가 비동기이므로 대화상자 기록이 늘 때까지(최대 3초) 기다린다 |
| 다운로드 | `window.downloadFile`을 기록기로 바꾼다(함수 선언은 쓰기 가능한 전역 속성이고, `exportHTML`·`exportJSON`은 전역 이름으로 부른다). 내용·형식·파일 이름을 시험이 검사한다 |
| 모달·키보드 | 입력값을 넣고 `form.requestSubmit()`(Enter와 같이 `required` 검증을 거침), `keydown`(`Escape`)을 `document`에 보냄 |
| 드래그 | `DragEvent`(`dataTransfer: new DataTransfer()`)로 `dragstart` → `dragover` → `drop` → `dragend` |
| 포커스 | 이동 버튼을 누른 뒤 iframe 문서의 `activeElement` |
| 반응형 | iframe 폭을 360px로 두고 `scrollWidth <= clientWidth` |

### 3.5 서비스 워커와의 관계

- **시험 출처:** `srcdoc` 앱은 서비스 워커를 등록하지 않는다(3.2). 러너는 매번 새 임시 프로필로 브라우저를 띄우므로 이전 등록·캐시도 없다. 사람이 `node tests/run.mjs --serve`로 띄운 서버에서 `http://127.0.0.1:8766/index.html`을 직접 열었다면 앱의 서비스 워커가 범위 `/`로 등록돼 이후 `run.html` 탐색을 가로챌(네트워크 우선, 캐시에 저장) 수 있다. 그래서 `run.html`은 시작할 때 **자기 출처의** 서비스 워커 등록을 해제하고 `jdrbm-` 캐시를 지운다(가드 3.6을 통과한 시험 출처에서만).
- **앱 출처(GitHub Pages, 개발용 포트):** 누가 `tests/run.html`로 탐색하면 앱의 서비스 워커(범위 = 앱 폴더)가 탐색 요청을 네트워크 우선으로 처리하며 그 페이지를 `jdrbm-` 캐시에 넣는다. 몇 KB이고 다음 `CACHE_NAME`에서 지워지므로 둔다. `run.html`은 가드 때문에 그 출처에서 아무것도 하지 않는다.
- **`APP_SHELL`·`CACHE_NAME`:** 영향 없음. 시험 파일은 캐시할 앱 파일이 아니고(3.1), `sw.js`는 바꾸지 않는다.

### 3.6 출처 가드 — 실제 데이터 보호

시험은 시험마다 자기 출처의 `localStorage`를 비운다. 앱과 같은 출처(GitHub Pages의 `jaydrobin.github.io`, 수동 시험용 개발 포트)에서 열리면 **사용자의 로컬 목록을 지운다.** 그래서:

- `run.html`은 `location.hostname`이 `127.0.0.1` 또는 `localhost`이고 `location.port`가 **`8766`**(시험 전용 포트 상수)일 때만 시험을 돌린다. 아니면 "이 주소에서는 시험을 돌리지 않습니다(시험 전용 포트 8766)"만 보이고 저장소·서비스 워커를 건드리지 않는다.
- 러너는 `127.0.0.1`에만 바인딩하고, `GET`은 저장소 폴더 안의 파일만(경로 이탈 차단), `POST`는 `/__result`만 받는다. 포트가 사용 중이면 시험하지 않고 알린다.
- 수동 시험(코드 점검 규약 3)은 다른 포트(예: 지금 쓰는 8765)를 쓴다. 8766은 시험 전용이라고 README·CLAUDE.md에 적는다.
- 결과적으로 시험 데이터는 ① 다른 포트(= 다른 출처) ② 러너의 임시 프로필(실행마다 새로 만들고 지움) 두 겹으로 분리된다.

### 3.7 GitHub Pages 배포

`tests/`도 `main`과 함께 공개 배포된다. 괜찮다고 본다:
- 저장소가 이미 공개이고 시험 파일에 비밀 값이 없다(Firebase 설정값은 원래 공개 값, D-021).
- `run.html`은 가드(3.6) 때문에 Pages에서 아무것도 하지 않는다. `run.mjs`는 정적 파일로 내려갈 뿐 실행되지 않는다.
- 배포에서 빼려면 호스팅 전용 설정(Jekyll `exclude`, 워크플로)이 필요해 D-023과 맞지 않는다.

### 3.8 시험이 실제로 잡아내는지: 변이 점검

`node tests/run.mjs --mutants`는 앱 원문에 **알려진 결함을 하나씩 문자열 치환으로 넣은 변이**마다 전체 시험을 돌린다. 작업 트리의 `index.html`은 바꾸지 않는다(주입 단계에서 치환). 변이마다 하나 이상의 시험이 실패해야 하고(= 잡음), 모두 통과하면 "살아남은 변이"로 실패 처리한다. 치환할 원문을 찾지 못하면 "변이 대상 없음"으로 실패 처리해 코드가 바뀌었음을 알린다.

처음 넣을 변이(`tests/cases.js`의 `MUTANTS`):

| 변이 | 치환 | 잡아야 할 시험 |
|---|---|---|
| URL 스킴 검사 제거 | `isSafeUrl`이 늘 `true` | 9 (`javascript:` 항목 거절), 점검(XSS·URL) |
| 카드 `href` 이스케이프 제거 | `href="${escapeHtml(bm.url)}"` → `href="${bm.url}"` | 점검(XSS) |
| 병합 ID 중복 검사 제거 (K-05) | `usedIds.has(bm.id)` → `false` | 8 (두 번 병합 뒤 하나만 삭제) |
| 카테고리 갱신 순서 (K-07) | `renderBookmarks`에서 `updateCategoryOptions()`를 필터 뒤로 | 4 (필터 중 마지막 항목 삭제) |
| 마이그레이션 저장 제거 | `loadBookmarks`의 v3 키 쓰기 삭제 | 11 |
| 가져오기 중복 건너뛰기 제거 | `if (seen.has(key)) return false;` 삭제 | 10 (다시 가져오기) |
| 설정 필수 키 검사 제거 | `FIREBASE_REQUIRED_KEYS.every(…)` → `true` | 24 |

규약: 새 검증(정규식·불변식·보안 검사)을 더하면 그 검증을 빼는 변이를 `MUTANTS`에 더한다. 코드 점검 규약 3의 "그 검증을 잠시 빼면 시험이 실패하는지까지 본다"를 손으로 하는 대신 이것으로 한다. 변이 점검은 시간이 변이 수만큼 걸리므로 작업 완료(작성 절차 3) 때 한 번 돌린다.

### 3.9 러너 동작과 출력

```
node tests/run.mjs            # 전체 자동 시험
node tests/run.mjs --mutants  # 변이 점검
node tests/run.mjs --serve    # 서버만 띄움 (보통 브라우저로 http://127.0.0.1:8766/tests/run.html 열어 보기, Ctrl+C로 끝)
```

Git Bash와 PowerShell에서 같다. 브라우저는 환경 변수 `BROWSER_PATH` → 크롬(`%ProgramFiles%`·`%ProgramFiles(x86)%`·`%LocalAppData%`의 `Google\Chrome\Application\chrome.exe`) → 엣지(`Microsoft\Edge\Application\msedge.exe`) → macOS·리눅스의 흔한 경로 순으로 찾는다. 이 PC에서 실제로 실행되는 명령:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --user-data-dir=<임시 폴더> --no-first-run --no-default-browser-check --disable-extensions --disable-background-networking --disable-component-update --disable-sync "http://127.0.0.1:8766/tests/run.html?report"
```

- 60초 안에 결과가 오지 않으면 "시험이 끝나지 않음"으로 실패. 결과를 받으면 브라우저 프로세스 트리를 끝내고(윈도우는 `taskkill /T /F`, 엣지가 남는 것을 실험에서 봄) 서버를 닫고 임시 프로필을 지운다(지우기 실패는 무시).
- 출력 (UTF-8):

```
자동 시험: 통과 41/전체 43 (크롬 155, 3.2초)
실패:
  [4] 필터 중 그 카테고리의 마지막 항목을 지우면 '전체'로 돌아감 — 기대 "all", 실제 "개발"
  [점검] 콘솔 오류 없음 (10: 브라우저 북마크 가져오기) — TypeError: …
수동으로 남은 번호: 12~21, 그리고 22~24의 로그인 버튼·서비스 워커 부분 (CLAUDE.md 코드 점검 규약 3)
```

- 종료 코드: 모두 통과 0, 실패 1, 하네스·브라우저·포트 오류 2.

## 4. 자동화 범위

| 번호 | 자동 | 수동으로 남는 부분과 이유 |
|---|---|---|
| 1 시드 | 시드 3개. 덧붙여 깨진 `localStorage`(JSON 아님·배열 아님) → 시드 + `_broken` 키 보관(D-014) | — |
| 2 추가 | `example.com` + 제출 → `https://example.com`, 맨 앞, `addedAt` 숫자. 빈 칸 제출 → 저장 안 됨. Esc → 모달 닫힘 | — |
| 3 수정·삭제 | 수정 → 값 바뀜, `addedAt` 유지. 삭제 확인 → 사라짐, 취소 → 남음, `confirm` 1회 | 확인 창의 모양 |
| 4 검색·필터 | 제목·URL 검색(대소문자 무시), 카테고리 필터, 필터 중 마지막 항목 삭제 → `all` | — |
| 5 순서 | [←]/[→] 이동과 포커스 유지, 맨 앞·맨 뒤 버튼 비활성, 드래그 이동, 다시 열어도 유지, 필터 중 이동 | 실제 마우스 드래그 감촉 |
| 6 테마 | 열 때 `prefers-color-scheme`대로이고 저장 안 함, 전환 → 저장, 다시 열어도 유지 | 열린 동안 OS 설정 바꾸기(헤드리스에서 바꿀 수 없음) |
| 7 HTML 내보내기 | 내보낸 문서: `NETSCAPE` 머리말·`generator` 표시, 카테고리 = 폴더, 카테고리 없음 = `기본 북마크`, `ADD_DATE` = `addedAt`/1000, 제목·주소 이스케이프 | 크롬에서 실제로 가져오기 — 릴리스 PR에서만 |
| 8 JSON 백업·복구 | 백업 내용 = 목록. [확인] 덮어쓰기, [취소] 병합(앞에 붙음). 같은 파일 두 번 병합 뒤 하나 삭제 → 하나만 사라짐. 문자열 ID·중복 ID 정규화 | — |
| 9 잘못된 파일 | 배열 아닌 JSON, 텍스트, 빈 HTML, 북마크 없는 HTML, `javascript:`만 있는 JSON → 알림 문구, 목록 그대로, 이어서 추가 가능 | — |
| 10 브라우저 북마크 | 크롬 형식 픽스처: 개수 확인 → 맨 앞 추가, 가장 안쪽 폴더 = 카테고리, 최상위 폴더 제외, `ADD_DATE` → 추가 시각, `javascript:` 건너뜀, 다시 가져오기 → "새로 가져올 북마크가 없습니다", 7의 내보내기를 빈 목록에 가져오면 카테고리(`기타 북마크` 포함) 복원 | 실제 크롬에서 내보낸 파일 — 릴리스 PR에서만 |
| 11 마이그레이션 | v2 키만 → 같은 목록, v3 키 생김, v2 키 남음 | — |
| 12~21 클라우드 | — | 전부 (실제 계정·Firestore·로그인) |
| 22 `config.js` 없음 | 판정: `FIREBASE_CONFIG`가 기본 설정, 경고 없음 | 로그인 버튼, 404 한 줄, 서비스 워커 설치·오프라인 (실제 `http`와 SDK 필요) |
| 23 `firebase: null` | 판정: `null`, 경고 없음. 로그인한 채로 닫은 표시·사본을 넣고 열면 잠기지 않고 로컬 목록, 두 키 지워짐 | 로그인 버튼 없음, 서비스 워커 등록 |
| 24 형식 오류 | `apiKey` 누락·`firebase: 'x'`·`const APP_CONFIG` → `null` + 경고 1줄. 다른 프로젝트 값 → 그 `projectId` | `firebase.app.options.projectId`(SDK 필요) |
| 점검 (번호 없음) | XSS: 제목·주소·카테고리에 `"><img onerror>`·`'` 넣어도 속성이 끊기지 않고 스크립트 안 돎. 360px 폭 가로 스크롤 없음. 모든 시험 공통: 예상 밖 콘솔 오류·예외 없음, 파비콘 밖 외부 요청 없음 | 다크 모드 가독성 |

`srcdoc` 앱은 `about:`이라 23의 "키 지우기"는 설정과 무관하게 같은 경로(`if (!canUseCloud()) forgetCloudCopy()`)를 지난다. 이 시험은 그 경로를 덮고, 설정에 따라 갈리는 부분(로그인 버튼)은 수동으로 남긴다.

## 5. 위험과 대응

| 위험 | 대응 |
|---|---|
| 시험이 실제 데이터를 지움 | 출처 가드(포트 8766만), 러너의 임시 프로필, 127.0.0.1 바인딩 (3.6) |
| 시험 중 Firebase·Google 접속 | `about:`으로 클라우드 꺼짐 + CSP로 외부 요청 차단 + 막힌 주소 검사 (3.2, 3.3) |
| `srcdoc` 환경이 실제와 다름 | 다른 점은 `location`(`about:srcdoc`)과 CSP뿐. 앱이 `location`을 쓰는 곳은 클라우드·서비스 워커 판단(수동 범위)과 `initCloud`의 리디렉트 판단(도달 안 함) |
| 앱 이름을 바꾸면 하네스가 깨짐 | getter·치환 대상을 찾지 못하면 실패로 알림. 고칠 곳은 `tests/` 안 |
| 헤드리스에서만 다른 동작(포커스·검증 등) | 실패하면 `--serve`로 보통 브라우저에서 같은 시험을 열어 비교 |
| 브라우저가 남음 | 프로세스 트리 종료, 60초 제한 |

## 6. 문서 반영 계획 (4단계)

- **DECISIONS.md:** D-027 "자동 회귀 시험"(2장의 비교, 3장의 결정, 결과·대가) 추가. K-23 → `해결 (커밋)`. 2장 기능 목록에 "자동 회귀 시험 (D-027)" 행. 1장 구성 표에 `tests/`. 3장 끝 "서비스 워커 캐시"에 시험 파일은 캐시하지 않음.
- **CLAUDE.md:** 첫 문단의 "자동 테스트가 없고" 수정. 구조 표에 `tests/run.mjs`·`run.html`·`cases.js`. 원칙에 "Node는 시험 도구로만, 내장 모듈만". 작성 절차 2(커밋 직전 자동 시험)·3(전체 시험 = 자동 시험 + 남은 수동 번호, 변이 점검)·4. 코드 점검 규약 0(독립 점검자가 자동 시험을 돌려도 되는지, 8장 Q4), 2(기계 점검에 자동 시험), 3(번호마다 자동/수동 표시, 새 검증은 변이 추가, 시험 포트 8766).
- **README:** "설치·배포"에 "자동 시험" 절 (명령, 필요한 것: Node·크롬 또는 엣지, 포트 8766, `--serve`·`--mutants`).

## 7. 구현 단계

- **1단계: 하네스** — `run.mjs`(서버·브라우저·결과·정리), `run.html`(가드·주입·기록기·실행·보고), `cases.js`에 1·2번. 확인: 명령 하나로 `통과 n/전체 n`, 일부러 틀린 기대값으로 실패 목록·종료 코드 1, 가드(다른 포트에서 아무것도 안 함).
- **2단계: 로컬 모드 시험** — 3~11, 점검(XSS·360px·콘솔·외부 요청).
- **3단계: 설정 판정과 변이 점검** — 22~24 판정, `--mutants`와 3.8의 변이. 확인: 변이마다 잡힘.
- **작업 완료 점검 → 독립 점검** (작성 절차 3·4) — 이때 수동으로 남은 번호 가운데 diff가 닿는 것은 없음(`index.html` 안 바뀜).
- **4단계: 문서 통합** — 6장 반영, 이 문서 삭제.

## 8. 질문과 결정

2026-10-22 사용자가 모두 권장안대로 승인했다.

| # | 질문 | 결정 |
|---|---|---|
| Q1 | 실행 방식 | B. `node tests/run.mjs` 하나(Node 내장 모듈만, 서버·헤드리스 브라우저·결과 POST·정리). D-027에 Node를 시험 도구로 적는다 |
| Q2 | 앱 상태 접근과 로컬 모드 강제 | `srcdoc` 주입(`<base>`·CSP·기록기·getter). `index.html`은 바꾸지 않는다 |
| Q3 | 데이터 분리 | 시험 전용 포트 8766 + `run.html` 출처 가드 + 러너의 임시 프로필 |
| Q4 | 독립 점검자의 자동 시험 | 허용. 코드 점검 규약 2(기계 점검)에 넣고 0절 "브라우저 금지"에 예외 한 줄 |
| Q5 | 커밋 직전 | 자동 시험은 커밋마다 전부 돌린다. 수동 번호는 지금처럼 바뀐 동작에 닿는 것만 |
| Q6 | 잡아내는지 확인 | `--mutants` 변이 점검. 작업 완료 때 한 번, 새 검증을 더하면 변이도 더한다 |
| — | 자동화 범위 | 4장 표대로 |
