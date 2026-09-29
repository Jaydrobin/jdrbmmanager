# 배포별 설정 파일(config.js) 설계

- **상태:** 확정 (2026-09-29). 8장에 확정한 답을 적었다. 7장의 단계 순서대로 구현한다.
- **수명:** 구현을 위한 임시 문서다. 마지막 단계(7장 2단계)에서 코드를 점검하고, 필요한 내용을 DECISIONS.md·CLAUDE.md·README로 옮긴 뒤 **이 문서를 삭제한다.**
- **기준 코드:** v0.7 (커밋 `05053de`). 줄 번호와 함수 이름은 이 시점의 `index.html`·`sw.js` 기준.
- **관련 결정:** DECISIONS.md D-026(이 설계). 바탕은 D-018(파일 구성), D-019(두 모드), D-021(설정값 공개, 허용 UID), D-022(서비스 워커), D-023(호스팅 이식성), D-025(계정 목록 사본).

---

## 1. 요구사항과 범위

| 요구사항 | 내용 |
|---|---|
| **R1. 코드 수정 없이 자기 Firebase 프로젝트 쓰기** | 저장소를 포크한 사람이 `index.html`을 고치지 않고 `config.js`만 바꿔 자기 Firebase 프로젝트로 로그인·동기화한다 |
| **R2. `index.html` 하나로도 지금처럼 동작 (B 방식)** | `config.js`가 없거나 아무것도 설정하지 않았으면 `index.html`에 들어 있는 **기본 설정**(지금의 `jdrbmmanager` 프로젝트)을 쓴다. `file://`로 열면 지금처럼 로컬 모드 |
| **R3. 지금 배포는 그대로** | GitHub Pages 설정·주소·데이터·로그인 상태가 바뀌지 않는다. 사용자가 할 일은 없다 |
| **R4. 클라우드를 끄는 배포** | `config.js`에서 Firebase를 끄면 로그인 버튼 없이 로컬 모드로만 동작한다 (Q3) |

**하지 않는 것**
- 앱 화면에서 설정값을 입력받기: 설정이 기기마다 따로 저장돼 여러 기기에서 맞춰야 하고, 잘못 넣으면 되돌리는 화면까지 필요하다.
- 허용 UID를 `config.js`로 옮기기: 허용 UID는 서버의 보안 규칙(`firestore.rules`)이 검사하므로 앱 파일로 옮길 수 없다. 포크한 사람은 지금처럼 자기 콘솔에 규칙을 게시한다.
- SDK 버전(`FIREBASE_SDK_URL`)과 길이 제한(`MAX_*_LENGTH`)을 설정으로 빼기: 버전은 `sw.js`와, 길이 제한은 `firestore.rules`와 함께 바뀌어야 하는 값이라 코드에 둔다.
- 저장 형식의 변경: `localStorage` 키·사본·Firestore 문서·JSON 백업은 그대로다(`STORAGE_KEY`를 올리지 않는다).

## 2. 지금 설정값이 쓰이는 곳

| 위치 | 내용 | 바뀌는 점 |
|---|---|---|
| `index.html:200` `FIREBASE_CONFIG` | 설정값 상수 | 기본값 `DEFAULT_FIREBASE_CONFIG`로 이름을 바꾸고, 실제로 쓸 값은 `resolveFirebaseConfig()`가 정한다 (3.3) |
| `index.html:220` `cloudLoading` 초기값 | `canUseCloud()`와 `CLOUD_HINT_KEY`로 계정 준비 전 잠금을 할지 정함 | 클라우드가 꺼져 있으면 `false`여야 한다. 그렇지 않으면 잠긴 채 멈춤 (3.4) |
| `index.html:221` `bootCopy` | 로그인한 채로 닫았으면 계정 목록 사본을 바로 보임 (D-025) | 클라우드가 꺼져 있으면 읽지 않고, **남은 사본과 표시 키를 지운다** (3.4) |
| `index.html:424` `canUseCloud` | `http(s)`인지 검사 | 설정이 있는지도 함께 검사 |
| `index.html:456` `initCloud` | `initializeApp(FIREBASE_CONFIG)` | 변경 없음(`canUseCloud`가 막아 줌) |
| `index.html:471`, `556` | `FIREBASE_CONFIG.authDomain`으로 리디렉트 로그인 여부 판단 (D-021) | 변경 없음(정해진 설정의 `authDomain`을 씀) |
| `index.html:1521` 서비스 워커 등록 | `canUseCloud()`로 `http(s)`인지 검사 | **클라우드를 꺼도 서비스 워커는 등록해야 한다.** 프로토콜만 보는 함수로 바꾼다 (3.4) |

## 3. 설계

### 3.1 `config.js` 형식

```js
/* 배포별 설정 (선택, DECISIONS.md D-026)
   고치지 않으면 index.html에 들어 있는 기본 Firebase 프로젝트를 쓴다.
   - 자기 Firebase 프로젝트를 쓰려면: 아래 주석을 풀고 Firebase 콘솔의 firebaseConfig 객체 안의 값만 옮긴다.
   - 로그인 없이 로컬 모드로만 쓰려면: firebase: null
   window.APP_CONFIG에 값을 넣는 것 말고 다른 선언(const, let, function 등)을 추가하지 않는다.
   index.html의 이름과 겹치면 앱 스크립트 전체가 멈춘다. */

// window.APP_CONFIG = {
//   firebase: {
//     apiKey: '...',
//     authDomain: '...',
//     projectId: '...',
//     storageBucket: '...',
//     messagingSenderId: '...',
//     appId: '...'
//   }
// };
```

- 값은 전역 변수 **`window.APP_CONFIG`**에 대입한다(Q1). `const APP_CONFIG = …`로 선언하면 `window`의 속성이 되지 않아 읽히지 않으므로, 템플릿에서 대입 형태를 보여 준다.
- 저장소에는 이 **주석뿐인 템플릿**을 커밋한다(Q2). 파일이 늘 있으므로 지금 배포에서 404 요청이 생기지 않고, 포크한 사람은 이 파일만 고치면 된다.
- Firebase 콘솔이 보여 주는 코드(`import …`, `const firebaseConfig = …`)를 통째로 붙여 넣으면 동작하지 않는다(`import`는 일반 스크립트에서 문법 오류). README와 템플릿 주석에 **객체 안의 값만 옮기라고** 적는다.

### 3.2 불러오기

```html
<!-- 배포별 설정(선택). 없거나 비어 있으면 기본 설정을 쓴다 (D-026) -->
<script src="config.js"></script>
<script>
  /* 기존 앱 스크립트 */
```

- **일반 스크립트**로 앱 스크립트 바로 앞에서 불러온다. `defer`·`async`·`type="module"`을 쓰지 않는다. 이렇게 해야 앱 스크립트보다 먼저 실행되고, 파일이 없거나 오류가 나도 앱 스크립트는 그대로 실행된다. 모듈을 쓰지 않는 이유는 D-018과 같다(`file://`에서 막히고 실패하면 멈춤).
- 같은 출처의 파일이라 새 외부 요청이 아니다(D-018의 허용 목록 그대로). 경로는 상대 경로(D-023).
- `file://`에서도 일반 스크립트는 같은 폴더의 파일을 읽는다(추정, 1단계에서 확인). 어느 쪽이든 `file://`는 로컬 모드이므로 결과는 같다.

### 3.3 쓸 설정 정하기

```js
  // 기본 Firebase 설정. config.js가 없거나 설정하지 않았으면 이 값을 쓴다 (D-026).
  // 공개돼도 되는 값이다(비밀 키 아님). 데이터는 보안 규칙과 승인된 도메인으로 보호한다.
  const DEFAULT_FIREBASE_CONFIG = { /* 지금의 FIREBASE_CONFIG 값 그대로 */ };
  const FIREBASE_REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const FIREBASE_CONFIG = resolveFirebaseConfig(); // null이면 클라우드 끔
```

| `window.APP_CONFIG` | 결과 | 이유 |
|---|---|---|
| 없음(`undefined`): 파일 없음, 템플릿 그대로, 파일에 문법 오류 | **기본 설정** | R2 |
| 객체인데 `firebase` 키가 없음 | **기본 설정** | 나중에 다른 설정 항목이 생겨도 Firebase는 기본값을 쓰도록 |
| `firebase: null` | **클라우드 끔** (`null`) | R4, Q3 |
| `firebase`가 객체이고 `FIREBASE_REQUIRED_KEYS`가 모두 비어 있지 않은 문자열 | **그 설정** (얕은 복사) | R1 |
| 그 밖(객체 아님, 필수 값 누락·빈 문자열, `firebase`가 문자열 등) | **클라우드 끔** + `console.warn` | Q4. 다른 프로젝트를 쓰려던 배포가 조용히 기본 프로젝트로 붙지 않게 |

- `resolveFirebaseConfig`는 `function` 선언이라 호이스팅되므로, 상단 상수에서 호출하고 본문은 `로그인 및 클라우드 동기화` 구역에 둔다.
- 설정 객체의 필드별 병합은 하지 않는다. 두 프로젝트의 값이 섞이면 의미가 없다.
- `config.js`는 배포한 사람이 직접 두는 **코드**다(불러오는 순간 실행됨). 그래서 D-014처럼 데이터로 검증하는 대상은 아니고, 형식만 확인해 설정 실수로 앱이 멈추지 않게 한다.

### 3.4 클라우드 사용 여부 판단 분리

```js
  // http(s)로 열었는지. 서비스 워커는 클라우드 설정과 관계없이 이것만 본다.
  function isServedOverHttp() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function canUseCloud() {
    return isServedOverHttp() && FIREBASE_CONFIG !== null;
  }
```

- `cloudLoading` 초기값(220)과 `initCloud`(457)는 `canUseCloud()`를 그대로 쓴다. 클라우드가 꺼져 있으면 `CLOUD_HINT_KEY`가 남아 있어도 잠그지 않고 로컬 목록을 보인다.
- 서비스 워커 등록(1521)은 `isServedOverHttp()`로 바꾼다.
- **남은 사본 정리:** 클라우드가 꺼져 있는데 `CLOUD_HINT_KEY`가 있으면(로그인한 채로 닫은 뒤 설정을 끔), 시작할 때 그 uid의 사본(`CLOUD_COPY_KEY_PREFIX + uid`)과 표시 키를 지운다. 이 경우 `handleAuthChange`가 실행되지 않아 사본이 영영 남기 때문이다. 처리는 "로그인이 풀려 있는 경우"(`handleAuthChange`의 `!user` 분기, D-025)와 같다. 사본은 올릴 변경의 대기열이 아니므로(대기열은 Firestore IndexedDB 캐시) 지워도 잃는 데이터가 없다.
  - Firestore IndexedDB 캐시와 Auth 로그인 상태는 SDK 없이 지울 수 없어 남는다. 설정을 다시 켜고 로그인하면 이어서 쓰이고, 로그아웃할 때 지금처럼 지워진다.
- **다른 프로젝트로 바꾼 경우:** 이전 프로젝트의 uid가 표시 키에 남아 있으면, SDK를 불러오는 동안 이전 계정의 사본이 잠긴 채 잠깐 보인다. 새 프로젝트에는 그 로그인이 없으므로 `handleAuthChange(null)`이 지금처럼 사본과 표시 키를 지우고 로컬 목록으로 돌아간다. 설정을 바꿀 때 한 번만 생기므로 추가 처리는 하지 않는다.

### 3.5 서비스 워커

`config.js`가 없는 배포도 있으므로 **`APP_SHELL`에 넣지 않는다.** `cache.addAll`은 파일 하나라도 실패하면 설치 전체가 실패하기 때문이다.

```js
// 없어도 되는 파일. 있으면 캐시하고, 없으면 설치를 실패시키지 않는다.
const OPTIONAL_FILES = ['./config.js'];

// install
cache.addAll([...APP_SHELL, ...SDK_FILES])
  .then(() => Promise.all(OPTIONAL_FILES.map(file => cache.add(file).catch(() => {}))))
```

- `fetch`에서 `config.js`는 앱 본체처럼 **네트워크 우선**으로 처리한다(`url.pathname.endsWith('/config.js')`). 설정을 바꾸면 다음에 열 때 바로 반영되고, 오프라인에서는 캐시한 설정으로 열린다.
  - 오프라인에서 캐시가 없으면 요청이 실패하고, 3.3에 따라 기본 설정을 쓴다. 포크한 배포에서 이런 일이 생기지 않도록 설치 때 미리 캐시한다.
  - `networkFirst`는 `response.ok`일 때만 캐시하므로 404는 캐시되지 않는다.
- 앱 파일이 바뀌므로 `CACHE_NAME`을 `jdrbm-v0.8`로 올린다(Q5).

### 3.6 포크한 사람의 절차 (README에 추가)

1. 저장소 포크
2. README "처음 설정" 1~5단계로 자기 Firebase 프로젝트 준비(승인된 도메인에 자기 Pages 주소 추가)
3. `config.js`의 주석을 풀고 콘솔의 `firebaseConfig` 값 넣기
4. 자기 GitHub Pages 켜기 → 한 번 로그인해 UID 확인 → 자기 `firestore.rules`의 허용 목록을 자기 UID로 바꾸고 자기 콘솔에 게시
5. 원래 저장소의 변경을 받아올 때 `config.js`는 거의 바뀌지 않지만, 바뀌면 충돌을 직접 해결한다(자기 값 유지)

## 4. 위험과 대응

| 위험 | 대응 |
|---|---|
| `config.js`에서 `const`·`let`·`function`으로 **`index.html`과 같은 이름**을 선언하면 앱 스크립트 전체가 문법 오류로 멈춤 | 템플릿 주석과 README에 경고. `index.html`은 `window.APP_CONFIG`만 읽고 `APP_CONFIG`라는 최상위 이름을 선언하지 않는다. 5장 T6으로 확인 |
| `config.js`에 문법 오류가 있거나 `const APP_CONFIG`로 선언하면 **조용히 기본 설정**으로 동작 | 콘솔에 오류는 남음. 포크한 사람의 주소는 기본 프로젝트의 승인된 도메인이 아니라 로그인이 막히고(`auth/unauthorized-domain`), `localhost`에서 로그인해도 보안 규칙이 허용 UID가 아니라서 거부하고 로그아웃함 → **데이터 노출·한도 사용 없음**. 지금도 공개된 설정값으로 같은 일을 할 수 있으므로 새 위험은 아님. 알려진 문제로 기록(수용) |
| `config.js` 없이 `index.html`만 복사하면 404 요청이 콘솔 오류로 남음 | 동작에는 영향 없음. 저장소에는 템플릿이 늘 있으므로 지금 배포에서는 생기지 않음. 알려진 문제로 기록(수용) |
| 클라우드를 끈 뒤 이전 계정의 사본이 남음 | 시작할 때 지움(3.4). 5장 T3 |
| 서비스 워커 설치 실패 | `APP_SHELL`과 분리(3.5). 5장 T8 |
| 설정을 바꿨는데 이전 설정이 보임 | 네트워크 우선(3.5). GitHub Pages의 HTTP 캐시(약 10분)는 `index.html`과 같은 조건 |
| 다른 프로젝트로 바꾼 뒤 이전 프로젝트의 로그인 상태·캐시가 섞임 | Auth·Firestore의 IndexedDB 저장은 프로젝트(`apiKey`·`projectId`)별로 따로라 섞이지 않음. 사본·표시 키는 3.4대로 처리. `single_file_bookmarks_migrated_<uid>`·사본 키는 uid별이라 영향 없음 |

## 5. 테스트

`http://localhost:포트`에서 한다(CLAUDE.md 코드 점검 규약). **브라우저에서 실행해 확인한 것만 "확인됨"으로 보고한다.** T4·T5는 설정값이 실제로 쓰였는지를 보는 것이 목적이라, 로그인까지 성공할 필요는 없다.

| # | 조건 | 기대 결과 |
|---|---|---|
| T1 | 저장소 그대로(템플릿 `config.js`) | 기본 프로젝트로 로그인·동기화. `config.js` 요청 200, 콘솔 오류 없음. CLAUDE.md 회귀 테스트 1~21 통과 |
| T2 | `config.js`를 치운 사본 | T1과 같이 동작. 콘솔에는 `config.js` 404 한 줄뿐 |
| T3 | `firebase: null` | 로그인 버튼 없음, 로컬 모드. 로그인한 채로 닫은 상태(`CLOUD_HINT_KEY`와 사본이 있음)에서 설정을 끄고 새로고침 → 잠기지 않고 로컬 목록이 보이며, 사본 키와 표시 키가 지워짐. 서비스 워커는 등록됨 |
| T4 | 형식이 틀린 값(`apiKey` 누락, `firebase: 'x'`, `APP_CONFIG = 1`) | 로그인 버튼 없음, 로컬 모드, 콘솔에 경고 한 줄 |
| T5 | 형식은 맞지만 다른 값(가짜 `projectId` 등) | 콘솔에서 `firebase.app.options.projectId`가 `config.js`의 값. 로그인은 실패 알림만 뜨고 앱은 정상. 로그인한 채로 닫은 상태에서 바꾸면 이전 사본이 잠깐 보인 뒤 로컬 목록으로 돌아가고 사본이 지워짐(3.4) |
| T6 | `config.js`에 `const DEFAULT_FIREBASE_CONFIG = {}` 추가 | 앱이 멈춤을 확인하고(위험 1의 근거), 템플릿 경고 문구가 이 경우를 설명하는지 확인 |
| T7 | `config.js`에 문법 오류, `const APP_CONFIG = {…}` | 기본 설정으로 동작, 콘솔에 오류 |
| T8 | 서비스 워커: `config.js`가 없는 사본에서 첫 설치 | 설치·활성화 성공, 오프라인으로 다시 열림 |
| T9 | 서비스 워커: `config.js`가 있는 상태로 설치 → 오프라인 | 캐시한 `config.js`로 열림(T5의 값이면 그 값). 온라인에서 `config.js`를 바꾸고 다시 열면 새 값 |
| T10 | `file://`로 `index.html` 열기(`config.js` 있을 때, 없을 때) | 로컬 모드로 정상 동작, 로그인 버튼 없음 |
| T11 | 360px 폭, 다크 모드 | 화면 변화 없음(마크업 변경이 `<script>` 한 줄뿐인지 확인) |
| T12 | 폰 테스트(README "폰 테스트") | Pages에서 `config.js`가 `/jdrbmmanager/config.js`로 서비스되고 로그인·동기화 정상. 끝나면 Pages 브랜치를 `main`으로 되돌림 |

- T3~T7은 `config.js`를 잠시 고친 **사본 폴더**나 되돌릴 수 있는 작업 트리에서 하고, 커밋하지 않는다. T3·T5에서 로그인한 채로 닫은 상태는 실제 로그인 대신 `CLOUD_HINT_KEY`와 가짜 사본을 직접 넣어 만든다(사용자 계정 데이터에 쓰지 않음).
- 클라우드 테스트는 사용자 계정의 실제 데이터에 쓰므로, 이름으로 구별되는 테스트 항목만 만들고 지운다(CLAUDE.md 회귀 테스트 21).

## 6. 문서 반영 계획

7장 2단계에서 아래 표대로 옮긴다.

| 내용 | 옮길 곳 |
|---|---|
| 결정: `config.js` 형식, 설정 정하기 규칙(3.3), 클라우드를 껐을 때의 사본 정리(3.4), 하지 않는 것(1장), 위험 대응 | DECISIONS.md D-026을 구현 결과로 고쳐 씀(설계 문서 링크 제거) |
| 파일 구성에 `config.js` | DECISIONS.md 1장 개요 표, D-018 파일 목록 |
| 로컬 모드 조건에 "설정으로 클라우드를 끔" | DECISIONS.md D-019 |
| 설정값 위치 | DECISIONS.md D-021의 "`index.html`의 `FIREBASE_CONFIG`에 둔다"를 "기본값은 `index.html`, 배포별 값은 `config.js`(D-026)"로 |
| 서비스 워커의 선택 파일 캐시(3.5) | DECISIONS.md D-022 |
| 기능 목록 | DECISIONS.md 2장에 "배포별 설정 (D-026)" 행 |
| 수용한 한계(4장의 404, 조용한 기본값 전환) | DECISIONS.md 5장에 K-NN(상태 `수용`) |
| 파일 구성, 원칙, 구역, 회귀 테스트 | CLAUDE.md: 첫 문단과 구조 표에 `config.js`, `sw.js` 설명(선택 파일), 원칙의 "캐시할 파일을 추가하면 `APP_SHELL`에" 규칙에 선택 파일 예외, 원칙에 "`config.js`에는 `window.APP_CONFIG` 대입만", 구역 표 (상단 상수)의 `FIREBASE_CONFIG`를 `DEFAULT_FIREBASE_CONFIG`·`resolveFirebaseConfig`로, 회귀 테스트에 T2·T3·T4를 줄인 항목 추가 |
| 설정 절차 | README: 파일 구성 표, `FIREBASE_CONFIG` 설명 문단, "처음 설정" 4단계, 새 절 "자기 Firebase 프로젝트로 쓰기(포크)"(3.6), "릴리스 전에 할 일" |
| 진행 중인 설계 안내 | CLAUDE.md "진행 중인 설계" 줄 제거 |

## 7. 구현 단계

| 단계 | 브랜치 / 릴리스 | 내용 | 완료 조건 |
|---|---|---|---|
| **0. 설계 확정** | `docs/config-file-design` → **v0.7.1** | 이 문서, DECISIONS.md D-026(확정, 이 문서 링크), CLAUDE.md "진행 중인 설계" 줄 | 8장의 모든 질문에 결정이 적혀 있음 — **완료** |
| **1. 구현과 테스트** | `feat/config-file` → **v0.8** | 3장 전체: `config.js` 템플릿, `index.html`(`<script src>`, 3.3, 3.4), `sw.js`(3.5, `CACHE_NAME`). 커밋 메시지는 `1단계: …` | 5장 T1~T11을 브라우저에서 확인하고 결과를 PR 본문 체크리스트에 적음. T12는 사용자와 함께 |
| **2. 점검과 문서 통합, 이 문서 삭제** | 1단계와 같은 브랜치 | 7.2의 순서대로. 머지 커밋 제목 `v0.8` | 7.2의 완료 확인을 모두 통과 |

### 7.1 진행 방식
- 단계마다 새 세션에서 시작해도 된다. 요청 예: "docs/CONFIG-FILE-DESIGN.md 7장의 1단계를 진행해줘."
- **시작하기 전에 `git fetch`로 원격 `main`을 받고 그 위에서 브랜치를 만든다.** 로컬 `main`이 뒤처져 있으면 이미 머지된 변경(예: 지워진 설계 문서)이 없는 코드에서 작업하게 된다.
- 첫 커밋 뒤 초안 PR을 열고, 본문에 단계별 완료 조건 체크리스트를 둔다.
- 구현 중 설계를 바꿔야 하면 같은 브랜치에서 이 문서를 먼저 고치고, 이유를 커밋 메시지에 적는다. 2단계의 문서 통합은 **바뀐 설계 기준**으로 한다.
- 보안 규칙(`firestore.rules`)은 바뀌지 않으므로 콘솔 게시는 필요 없다.
- 폰 테스트는 README "폰 테스트"(Pages 브랜치 전환) → 끝나면 `main`으로 되돌림.

### 7.2 점검과 문서 통합 (2단계)

**① 코드 점검** — CLAUDE.md "코드 점검 규약" 전체를 이번 변경에 적용한다.
- 체크리스트의 모든 항목을 하나씩 확인한다. 이번 변경에서 특히 볼 것:
  - **의존성:** 새 요청이 같은 출처의 `config.js` 하나뿐인가
  - **두 모드:** 기본 설정·다른 설정·클라우드 끔·Firebase 로드 실패 모두에서 로컬 모드가 동작하는가
  - **사본·묘비:** 클라우드를 껐을 때 남은 사본이 지워지는가(T3)
  - **콘솔:** T1에서 오류가 없는가
  - **상태 경로:** 설정 처리 코드가 `bookmarks`·`localStorage` 목록을 건드리지 않는가(사본·표시 키 삭제만 예외)
- 수동 회귀 테스트 1~21을 T1 조건에서 다시 한다(클라우드 12~21은 사용자가 로그인).
- 발견한 문제는 CLAUDE.md "보고 형식"(심각도·위치·재현·수정 제안)으로 적는다. 이번에 고친 것은 고친 커밋을, 고치지 않는 것은 DECISIONS.md 5장에 K-NN으로 추가한다.

**② 문서 통합** — 6장의 표를 위에서부터 옮긴다.
- D-026은 DECISIONS.md 6장 형식(상태·날짜·맥락·결정·결과)으로 고쳐 쓰고, 상태는 `확정 (v0.8에서 구현. 확인한 환경)`으로 적는다. 결과에는 구현하며 확인한 사실(T2의 404, T6의 멈춤, T9의 오프라인 동작 등)만 적는다.
- 이 문서의 3장 코드 조각은 옮기지 않는다. 코드가 원본이고, DECISIONS에는 "왜 그렇게 했는가"만 남긴다.
- DECISIONS.md 머리의 "마지막 갱신"을 고친다.

**③ 이 문서 삭제** — `docs/CONFIG-FILE-DESIGN.md`를 지운다. 지운 내용은 Git 기록에 남는다.

**④ 완료 확인**
- 저장소에서 `CONFIG-FILE-DESIGN`을 검색해 결과가 없다(CLAUDE.md의 안내 줄, DECISIONS.md D-026의 링크 포함).
- DECISIONS.md·CLAUDE.md·README만 읽고 새 세션이 다음에 답할 수 있다: `config.js`가 없을 때·`null`일 때·틀렸을 때 어떻게 되는가, 포크한 사람은 무엇을 고치는가, 서비스 워커가 `config.js`를 어떻게 다루는가.
- `sw.js`의 `CACHE_NAME`이 `jdrbm-v0.8`이다.
- 머지한 뒤 원격 `main`에 이 문서가 없는지 `git fetch` 후 확인하고, Pages 브랜치가 `main`인지 확인한다.

## 8. 질문과 결정

모두 2026-09-29에 확정. Q1~Q4는 추천대로, Q5는 사용자 결정.

| # | 질문 | 선택지 | 추천 / 결정 |
|---|---|---|---|
| Q1 | `config.js`의 값 형식 | (가) `window.APP_CONFIG = { firebase: {…} }` (나) `window.FIREBASE_CONFIG = {…}` | **(가) 확정.** `firebase: null`로 클라우드를 끌 수 있고(Q3), `index.html`의 상수 이름과 겹치지 않는다 |
| Q2 | 저장소에 둘 `config.js` | (가) 주석뿐인 템플릿을 커밋 (나) 파일 없이 `config.example.js`만 둠 (다) 지금 설정값을 채운 파일을 커밋 | **(가) 확정.** (나)는 지금 배포에서 열 때마다 404 오류가 남고, (다)는 같은 값이 두 곳에 있어 어긋날 수 있다. (가)는 포크한 사람이 이 파일 하나만 고치면 된다 |
| Q3 | 클라우드를 끄는 설정(`firebase: null`) | (가) 지원 (나) 지원 안 함 | **(가) 확정.** 로그인 없이 오프라인 앱으로만 배포하려는 경우에 쓰며, 코드는 `null` 검사와 남은 사본 정리(3.4) |
| Q4 | 형식이 틀린 설정 | (가) 클라우드 끔 + 콘솔 경고 (나) 기본 설정으로 동작 | **(가) 확정.** 다른 프로젝트를 쓰려던 배포가 기본 프로젝트에 조용히 붙지 않게 한다. 파일이 없거나 문법 오류로 읽히지 않은 경우는 구별할 수 없어 기본 설정(4장) |
| Q5 | 릴리스 번호 | — | **확정(사용자 결정).** 이 설계 문서의 PR은 `v0.7.1`(문서만, v0.5.1과 같은 방식), 구현 PR(1·2단계)은 `v0.8` |
