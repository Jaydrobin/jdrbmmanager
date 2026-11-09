# CLAUDE.md

정적 파일 몇 개로 된 북마크 관리자. 빌드·패키지가 없고(회귀 시험 대부분은 `node tests/run.mjs`로 자동, D-027), `index.html`을 브라우저로 열면 로컬 모드로 실행된다. `http(s)`로 열면 Google 로그인과 Firestore 동기화(클라우드 모드)를 쓸 수 있다. 쓸 Firebase 프로젝트는 배포별 설정 파일 `config.js`(없으면 `index.html`의 기본 설정, `null`이면 클라우드 끔)로 정한다. Firestore 보안 규칙은 `firestore.rules`에 두고 사용자가 Firebase 콘솔에 게시한다. `https`·`localhost`에서는 서비스 워커(`sw.js`)가 앱 파일과 SDK를 캐시해 오프라인에서도 열리고, `manifest.webmanifest`·`icons/`로 홈 화면에 설치할 수 있다.

- 기능 목록, 데이터 모델(localStorage·Firestore), 설계 결정(D-NNN), 알려진 문제(K-NN): [docs/DECISIONS.md](docs/DECISIONS.md) — 코드를 고치기 전에 닿는 절을 읽는다. 동기화 설계는 D-017~D-023, 바뀐 것만 받기(계정 목록 사본·묘비)는 D-025, 배포별 설정 파일은 D-026, 자동 회귀 시험은 D-027.
- 사용법, Firebase·GitHub Pages 설정, 포크해서 자기 Firebase 프로젝트로 쓰기, 배포·폰 테스트·호스팅 이전 절차, 자동 시험 실행법: [README.md](README.md).

## 구조

| 파일 | 내용 |
|---|---|
| `index.html` | 앱 본체. `<style>` → 마크업 → `<script>` 순서. 스크립트는 주석으로 구역을 나눈다(아래) |
| `config.js` | 배포별 설정(D-026). 저장소에는 주석뿐인 템플릿. 앱 스크립트 바로 앞에서 일반 스크립트로 불러오며, `window.APP_CONFIG = { firebase: {…} \| null }` 대입만 둔다 |
| `sw.js` | 서비스 워커. `CACHE_NAME`(릴리스마다 올림), `SDK_BASE`(`index.html`의 SDK 버전과 같게), `OPTIONAL_FILES`(없어도 되는 파일, 따로 캐시해 없어도 설치 성공), 앱 셸·`config.js`는 네트워크 우선(4초 넘으면 캐시), SDK·아이콘은 캐시 우선, 다른 출처는 가로채지 않음 |
| `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png` | 홈 화면 설치용. 아이콘은 `any`·`maskable` 겸용(가운데 안전 영역 안에 그림) |
| `firestore.rules` | Firestore 보안 규칙 (허용 UID, 항목 검증). 저장소에 두고 콘솔에 붙여넣어 게시 |
| `tests/run.mjs` | 시험 러너(D-027, Node 내장 모듈만). `PORT`(8766, 시험 전용), 정적 서버 + `POST /__result`, 브라우저 찾기(`BROWSER_PATH` → 크롬 → 엣지), 임시 프로필, 정리. `--mutants`, `--serve` |
| `tests/run.html` | 하네스. `TEST_PORT` 출처 가드, `index.html` 원문을 `srcdoc`에 주입(`<base>`·CSP·기록기 `__rec`·getter `__app`·`downloadFile` 기록기), `App`(조작 도우미), `eq`/`ok`/`waitFor`, 공통 검사(콘솔 오류·외부 요청), 변이 실행 |
| `tests/cases.js` | 시험 목록. `test('<회귀 번호>' 또는 '점검', 이름, fn)`, 픽스처(크롬 형식 북마크 HTML 등), `MUTANTS` |

`index.html` 스크립트의 구역별 함수·상수는 [docs/STRUCTURE.md](docs/STRUCTURE.md)에 있다. 스크립트를 고치거나 diff가 닿는 구역(회귀 수동 번호)을 가릴 때 읽는다. 구역 머리만 찾을 때: `rg -n "^\s*/\* -{3,}" index.html`

## 작성 규약

### 원칙
- **빌드 없음. 정적 파일 몇 개. 외부 코드는 버전 고정한 Firebase SDK만 (D-017).** 다른 라이브러리·CDN·빌드 도구가 필요하면 먼저 사용자와 상의하고 DECISIONS.md에 결정을 추가한다.
- Node는 시험 도구(`tests/run.mjs`)로만 쓰고 내장 모듈만 쓴다(`package.json`·npm 없음, D-027). 앱은 Node 없이 동작한다. 시험을 위해 `index.html`에 시험용 코드를 넣지 않는다(상태는 `__app` getter로 읽는다).
- 새 외부 네트워크 요청을 추가하지 않는다. 허용: 파비콘(D-008), `www.gstatic.com/firebasejs/`, Firebase SDK가 스스로 하는 Auth·Firestore 통신.
- Firebase SDK는 **동적 `import()`**로 불러온다. 불러오지 못하거나 `file://`로 열거나 설정(`config.js`)으로 클라우드를 꺼도 로컬 모드로 동작해야 한다. SDK 버전을 올리면 세 파일(`firebase-app/auth/firestore.js`)을 같은 버전으로 맞추고, `index.html`의 `FIREBASE_SDK_URL`과 `sw.js`의 `SDK_BASE`를 함께 고친다.
- 앱 파일(`index.html`, `config.js`, `sw.js`, 매니페스트, 아이콘)을 바꿔 릴리스할 때는 `sw.js`의 `CACHE_NAME`을 올린다. 캐시할 파일을 추가하면 `sw.js`의 `APP_SHELL`에도 넣는다. 없는 배포도 있는 파일(`config.js`처럼)은 `APP_SHELL`이 아니라 `OPTIONAL_FILES`에 넣는다(`addAll`은 하나만 없어도 설치 전체가 실패). `tests/`는 앱 파일이 아니라 캐시하지 않고, 시험만 바꾼 변경은 `CACHE_NAME`을 올리지 않는다.
- `config.js`에는 `window.APP_CONFIG = …` 대입만 둔다. 다른 최상위 선언이 `index.html`의 이름과 겹치면 앱 스크립트 전체가 멈춘다. 반대로 `index.html`은 `APP_CONFIG`라는 최상위 이름을 선언하지 않는다. 설정값을 쓰는 코드는 `resolveFirebaseConfig`가 정한 `FIREBASE_CONFIG`만 읽는다 (D-026).
- 앱 안의 경로는 상대 경로로 쓰고, 호스팅 전용 기능(주소 다시 쓰기·응답 헤더·리디렉트 설정)에 의존하지 않는다.
- 요청받은 범위만 고친다. 김에 리팩터링하지 않는다.

### JavaScript
- `const`/`let`만 쓴다. 함수는 `function` 선언, 이름은 camelCase, 상수는 `UPPER_SNAKE_CASE`.
- 상태는 전역 배열 `bookmarks` 하나다. **상태 변경은 작업 함수(`addBookmark` 등)로만 한다** — 작업 함수가 배열을 바꾸고, 다시 그린 뒤, 저장을 `store`에 맡기는 유일한 경로다. 작업 함수 밖에서 `bookmarks`를 바꾸거나 `localStorage`에 목록을 직접 쓰지 않는다. 예외는 클라우드 모드의 원격 변경(서버에서 받은 목록, 거부된 쓰기의 복구)으로, `showCloudList`와 `startCloudSync`에서만 바꾸고 사본은 CloudStore의 `saveCopy`만 쓴다.
- 클라우드 모드에서 북마크를 지울 때는 `deleteDoc`이 아니라 **묘비**(`{ deleted: true, updatedAt }`로 `setDoc`)를 쓴다. 문서를 지우면 바뀐 것만 받는 다른 기기가 삭제를 알 수 없다 (D-025). `deleteDoc`은 묘비 비우기에만 쓴다.
- 비동기 작업(서버 읽기, 쓰기 오류 처리)이 끝난 뒤에는 로그아웃했을 수 있으므로 `cloud !== session`이나 CloudStore의 `closed`를 확인하고 화면·사본을 건드린다.
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
- 커밋 메시지는 한국어 한 줄 요약(예: `JSON 복구 시 항목 검증 추가 (K-04)`). 버전 릴리스 커밋만 `vX.Y`. 커밋은 작업 브랜치에서 묻지 않고 한다.

## 작업 절차

작업 하나에 브랜치 하나·PR 하나로 하고, 머지는 사용자가 한다(GitHub Pages가 `main`을 자동 배포). 클라우드 세션은 응답마다 푸시하고 CI는 기다리지 않는다. 절차는 변경의 위험에 맞춰 고르고, 애매하면 가벼운 쪽을 고른다.

| 변경 | 절차 |
|---|---|
| 문서·규약·시험 도구(`tests/`) | 고치고 커밋한 뒤 PR |
| 일반 코드 | 구현하고 `node tests/run.mjs`와 바꾼 동작에 닿는 수동 번호를 돌린 뒤 PR. 동작을 바꾸면 그 시험을 `tests/cases.js`에 더하거나 고친다 |
| 저장 형식·데이터 손실·보안처럼 위험이 명확한 코드 | 아래 「위험한 변경」 |

회귀 1~24([docs/REGRESSION.md](docs/REGRESSION.md))는 「지켜야 할 동작」이다. 1~11과 22~24의 설정 판정은 `node tests/run.mjs`가 돌리고(묶음 이름 = 번호), 각 번호의 (수동) 부분은 손으로 한다. 클라우드 모드 12~21은 모두 수동이라, diff가 로그인·동기화 구역에 닿으면 PR의 「사용자가 확인할 항목」에 적는다.

### 위험한 변경
1. 설계도(`docs/<이름>-DESIGN.md`)를 첫 커밋으로 두고 채팅으로 승인받은 뒤 `N단계: …` 커밋으로 구현한다. 끝나면 설계도의 내용을 DECISIONS.md·README로 옮기고 설계도를 지운다.
2. 새 검증(정규식·불변식·보안 검사)에는 걸러야 할 입력이 걸러지는 시험과, 그 검증을 빼는 변이(`MUTANTS`)를 더한다.
3. 완료 때 `main...HEAD`를 직접 점검하고 전체 시험(`node tests/run.mjs`, `--mutants`, diff가 닿는 수동 번호)을 한 번 돌린다.
4. 그 뒤 독립 점검을 한 번 한다: 파일을 고치지 않는 하위 에이전트에 아래 지시문의 `<…>`만 채워 넘기고 설명을 덧붙이지 않는다. 지적된 결함은 재현해 보고 고치며, 기준 문서와 다르게 가야 하는 지적은 사용자에게 묻는다. 막는 지적을 고쳤으면 전체 시험을 한 번 더 돌린다. 결과(심각도별 건수, 고친 커밋, 안 고친 지적과 이유)는 PR 본문에 요약한다.

```
이 저장소 CLAUDE.md의 「독립 점검」대로 점검하고, 그 절의 보고 형식으로만 보고하라.
범위: <브랜치> <기준 커밋>..<끝 커밋> / 근거: <설계도 절 · 결정 항목 · 규약 절>
파일을 고치거나 커밋·푸시·브랜치 전환을 하지 마라.
```

### 독립 점검 (점검자가 읽는 절)
- 범위의 diff와 그것이 닿는 함수·호출하는 쪽을 근거(설계도, DECISIONS.md, 이 파일의 규약, REGRESSION.md)와 대조하고, `node tests/run.mjs`와 `--mutants`를 돌린다. 파일 수정·커밋·푸시·브랜치 전환과 브라우저·로그인·클라우드 테스트는 하지 않는다.
- 막는 지적은 근거와 다른 동작이면서 이 범위가 만들었거나 이 범위 때문에 드러난 것뿐이다. 그 전부터 있던 결함, 근거에 없는 경계, 범위 밖에서 본 것은 「후속」에 한 줄로 적는다.
- 보고는 「막는 지적」「수정·개선」「후속」「사용자가 확인할 항목」으로 나누고, 지적마다 위치(`파일:줄`·함수), 재현(입력과 절차 → 실제 / 기대), 심각도(높음: 보안·데이터 손실·앱 정지 / 중간: 기능 오동작 / 낮음: 불편·일관성), 근거, 수정 제안을 적는다.

### 그 밖의 절차
- 폰 확인은 README의 "폰 테스트"대로 하고, 끝나면 Pages를 `main`으로 되돌렸는지 본다.
- 머지 뒤 결함은 다음 작업 브랜치에서 고친다. 데이터 손실·보안처럼 기다릴 수 없으면 사용자에게 알리고 `fix/` 브랜치·별도 PR로 고친다.
- 브라우저는 한 번에 하나만 띄우고, 끝나면 브라우저와 서버를 정리한다. 포트 8766은 자동 시험 전용이다. 성능을 재거나 저장소 밖 헤드리스 브라우저 대본을 짤 때는 [docs/MEASURE.md](docs/MEASURE.md)를 먼저 읽는다.
- DECISIONS.md·설계도는 통독하지 않고 `rg`로 찾은 절만 읽는다.
- 사용자에게 물을 것은 모아서 한 번에, 선택지마다 권장안과 영향을 붙여 묻는다.
- **고치기의 상한:** 실패(자동 시험, 점검 지적, 측정 판정, 대본)를 고쳐 보는 시도(원인 가설 하나와 그에 맞춘 수정)는 두 번까지 하고, 시도마다 그 실패를 한 번만 다시 확인한다(측정이면 MEASURE.md 1의 한 쌍). 두 번째도 실패하거나 그 실패 하나에 30분을 넘기면 멈추고, 수치·시도와 결과·남은 선택지(다음 가설, 되돌리기, K-NN)와 각각의 영향을 적어 묻는다.
