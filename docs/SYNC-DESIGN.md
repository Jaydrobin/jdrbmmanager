# 여러 기기 동기화 설계 (Firebase)

- **상태:** 제안 — 7장 "열린 질문"이 정해지면 `확정`으로 바꾸고 구현을 시작한다.
- **작성일:** 2026-09-29
- **기준 코드:** v0.4 (커밋 `709799d`). 함수 이름은 그 시점 `index.html` 기준.
- **관련 결정:** DECISIONS.md D-017 (이 문서를 가리킴), D-001 (대체 예정)

---

## 1. 요구사항과 범위

| 요구사항 | 내용 |
|---|---|
| 여러 기기 | PC 브라우저와 **안드로이드 폰**(크롬)에서 같은 목록을 쓴다 |
| 로그인 | Google 계정 로그인 |
| 오프라인 | 네트워크 없이도 **앱 열기·조회·추가·수정·삭제·순서 변경**이 되고, 연결되면 자동으로 동기화된다 |
| 비용 | Firebase **Spark(무료) 요금제** 안에서만 쓴다. 결제 수단을 등록하지 않는다 |

**하지 않는 것**
- 여러 사람이 목록을 공유하는 기능 (사용자 = 나 한 명, 계정 여러 개는 가능)
- 같은 북마크를 두 기기에서 동시에 고쳤을 때 내용 합치기 (마지막 쓰기가 이김, 3.6)
- 아이폰 최적화 (동작은 하겠지만 확인 대상이 아님)
- 로그인 없이 기기 간 동기화

## 2. 구성 개요

```
┌──────────────── 브라우저 (PC / 안드로이드 크롬) ────────────────┐
│  index.html                                                    │
│   ├─ UI: renderBookmarks 등 기존 코드                           │
│   ├─ 상태 작업 함수: addBookmark / updateBookmark / ...  (3.5)  │
│   └─ 저장소 계층 store                                          │
│        ├─ LocalStore : localStorage (로그인 전, 지금과 같음)     │
│        └─ CloudStore : Firestore SDK ─ IndexedDB 오프라인 캐시   │
│  Firebase Auth (Google 로그인, 로그인 상태는 IndexedDB에 유지)   │
│  sw.js (서비스 워커): 앱 파일·SDK를 캐시해 오프라인에서도 열림   │
└──────────────────────────────┬─────────────────────────────────┘
                               │ 연결되면 자동 동기화
          ┌────────────────────┴─────────────────────┐
          │ Firebase 프로젝트 (Spark)                 │
          │  Hosting : <프로젝트>.firebaseapp.com     │
          │  Auth    : Google 제공업체                │
          │  Firestore: users/{uid}/bookmarks/{id}    │
          └──────────────────────────────────────────┘
```

## 3. 설계 결정 (제안)

### 3.1 Firebase(Auth + Firestore + Hosting)를 쓴다

요구사항 네 가지를 모두 만족하면서 **서버 코드를 직접 쓰지 않아도 되는** 선택지가 Firebase뿐이다.

| 후보 | 안드로이드 | Google 로그인 | 오프라인 동기화 | 무료 | 판단 |
|---|---|---|---|---|---|
| **Firebase** | ○ | ○ 기본 제공 | ○ SDK에 내장 (IndexedDB 캐시 + 쓰기 대기열) | ○ 결제 수단 없이 사용, 넘으면 요청이 거부될 뿐 과금 없음 | **채택** |
| Supabase | ○ | ○ | × 직접 구현해야 함 | △ 무료 프로젝트는 일정 기간 안 쓰면 일시 정지됨 | 오프라인 구현 부담 |
| Google Drive 앱 데이터 폴더 | ○ | ○ | × 파일 단위라 충돌·대기열을 직접 구현 | ○ | 구현량 큼 |
| 자체 서버 (Cloudflare Workers 등) | ○ | 직접 구현 | × 직접 구현 | ○ | 서버·인증 코드를 새로 써야 함 |
| 파일 동기화 (File System Access API) | **×** | - | - | ○ | 안드로이드 불가 |

대가: 외부 서비스에 묶이고, 외부 SDK가 들어온다(3.2). JSON 백업·HTML 내보내기는 계속 유지하므로 언제든 데이터를 빼서 다른 방식으로 옮길 수 있다.

### 3.2 파일 구성: D-001(단일 파일, 외부 의존성 없음)을 바꾼다

오프라인에서 앱을 열려면 서비스 워커가 필요한데, 서비스 워커는 **별도 파일이어야** 한다. Firebase SDK도 외부 코드다.

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 본체 (지금처럼 CSS·마크업·스크립트 한 파일). 스크립트는 `<script type="module">`로 바꾼다 |
| `sw.js` | 서비스 워커 (3.8) |
| `manifest.webmanifest` | "홈 화면에 추가"용 앱 정보 |
| `icons/icon-192.png`, `icons/icon-512.png` | 앱 아이콘 (안드로이드 설치 조건) |
| `firebase.json`, `.firebaserc` | Hosting 배포 설정 |
| `firestore.rules` | Firestore 보안 규칙 (3.9) |

- **빌드 도구·패키지 매니저는 여전히 쓰지 않는다.** Firebase SDK는 공식 CDN에서 **버전을 고정해** 불러온다.
  `https://www.gstatic.com/firebasejs/<버전>/firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`
  (작성 시점 문서의 버전은 12.19.0. 구현할 때 최신 버전을 확인해 고정한다.)
- 외부 요청 허용 목록: 파비콘(D-008), `www.gstatic.com/firebasejs/`, Firebase Auth·Firestore 통신. 이 밖의 요청은 계속 금지.

### 3.3 로컬 모드와 클라우드 모드

| | 로컬 모드 | 클라우드 모드 |
|---|---|---|
| 언제 | 로그인하지 않았을 때, `file://`로 열었을 때, Firebase SDK를 불러오지 못했을 때 | 로그인했을 때 |
| 원본 데이터 | `localStorage` (`single_file_bookmarks_v3`, 지금과 같음) | Firestore (기기에는 SDK의 IndexedDB 캐시) |
| 동기화 | 없음 | 자동 |

- 로그인하지 않아도 지금과 똑같이 쓸 수 있어야 한다. Firebase를 불러오지 못해도 앱이 멈추면 안 된다.
- 로그아웃하면 로컬 모드로 돌아가 **로그인 전 로컬 목록**이 보인다. 클라우드 캐시(IndexedDB)는 로그아웃할 때 지운다 (`terminate` → `clearIndexedDbPersistence`). (열린 질문 Q1)

### 3.4 데이터 모델

Firestore 경로: `users/{uid}/bookmarks/{문서 ID}`

```js
// 문서 ID = String(id)
{
  title: 'GitHub',                 // string, 1~500자
  url: 'https://github.com',       // string, http(s)만, 2048자 이하
  category: '개발',                // string, 100자 이하, 빈 문자열 가능
  addedAt: 1727600000000,          // number(ms) 또는 null (D-015)
  order: 1024,                     // number, 작을수록 앞 (새 필드)
  updatedAt: <serverTimestamp>     // 서버 시각, 규칙 검증용
}
```

- **메모리 상태는 지금처럼 `bookmarks` 배열 하나**이고, 항목 형태도 `{ id, title, url, category, addedAt }`를 유지한다 (`id`는 number). `order`는 클라우드 저장소 안에서만 다룬다.
- **순서 = `order` 필드.** 배열 전체를 저장하던 방식은 두 기기가 서로의 변경을 통째로 덮어쓰므로 쓰지 않는다.
  - 새 항목(맨 앞): `최소 order - 1024`
  - 이동: 이동한 뒤 앞뒤 이웃 order의 중간값 → **이동 한 번 = 쓰기 한 번**
  - 이웃 간격이 `1e-6`보다 작아지면 전체를 1024 간격으로 다시 매긴다 (드묾, 항목 수만큼 쓰기)
- **새 ID 생성 규칙 변경:** 두 기기가 오프라인에서 같은 ID를 만들지 않도록 `max(Date.now() * 1000 + 0~999 난수, 최대 ID + 1)`로 바꾼다 (2255년까지 안전한 정수 범위). 기존 ID와 JSON 백업은 그대로 쓸 수 있다.
- 제목 길이 제한(500자)을 앱의 `normalizeBookmark`에도 넣는다. 규칙과 앱의 검증이 다르면 앱에서는 저장됐는데 서버가 거부하는 일이 생긴다.

### 3.5 저장소 계층과 상태 변경 규칙

지금의 "상태를 바꾸면 `syncAndRender()`로 배열 전체 저장" 규칙을 **작업 단위 함수**로 바꾼다.

| 작업 함수 | 쓰는 곳 | CloudStore에서 |
|---|---|---|
| `addBookmark(item)` | 모달 저장(추가) | `setDoc` |
| `updateBookmark(id, fields)` | 모달 저장(수정) | `updateDoc` (없는 문서면 실패 → 삭제가 이김) |
| `removeBookmark(id)` | 삭제 | `deleteDoc` |
| `moveBookmark(id, toIndex)` | 드래그, 이동 버튼 | 옮긴 문서 하나의 `order`만 `updateDoc` |
| `replaceAll(list)` | JSON 복구 덮어쓰기 | `writeBatch`로 전부 삭제 후 쓰기 (배치당 500개씩 나눔) |
| `mergeAll(list)` | JSON 복구 병합, 첫 로그인 이전 | `writeBatch`로 쓰기 |

- 각 함수는 ① 메모리 배열을 바꾸고 ② 바로 다시 그린 뒤 ③ `store`에 저장을 맡긴다.
- **Firestore 쓰기의 Promise는 `await`하지 않는다.** 오프라인에서는 서버가 받을 때까지 끝나지 않기 때문이다. 오류는 `.catch`로 받아 알림만 띄운다.
- **원격 변경:** `onSnapshot(orderBy('order'))`로 받은 결과로 `bookmarks`를 교체하고 다시 그린다. 내 기기의 쓰기도 SDK가 먼저 반영해 주므로 화면과 캐시가 어긋나지 않는다.
- **Firestore에서 온 문서도 외부 입력이다.** 스냅샷의 모든 문서를 `normalizeBookmark`로 검증한다 (D-014와 같은 규칙).
- LocalStore는 지금처럼 배열 전체를 `localStorage`에 쓴다 (1단계에서 동작 변화 없음).

### 3.6 충돌 규칙

**문서(북마크) 단위로 마지막에 서버에 도착한 쓰기가 이긴다.** 목록 전체를 덮어쓰는 일은 없다.

| 상황 | 결과 |
|---|---|
| 두 기기에서 서로 다른 북마크를 수정·추가·삭제 | 모두 반영됨 |
| 같은 북마크를 두 기기에서 오프라인으로 수정 | 나중에 동기화된 쪽 내용이 남음 |
| 한쪽은 삭제, 한쪽은 오프라인으로 수정 | 삭제가 이김 (`updateDoc` 실패, 알림 없이 무시하고 콘솔에만 기록) |
| 두 기기에서 같은 북마크를 이동 | 나중 쪽 위치가 남음. 목록이 깨지지는 않음 |
| 한쪽에서 JSON 복구 덮어쓰기 중 다른 기기의 오프라인 쓰기가 늦게 도착 | 그 항목이 되살아날 수 있음 (수용) |

### 3.7 로그인

- Google 제공업체, `signInWithPopup`을 기본으로 쓰고, 팝업이 막히면 `signInWithRedirect`로 다시 시도한다.
- 앱은 **`<프로젝트>.firebaseapp.com`** 에서 서비스하고 `authDomain`도 같은 도메인으로 둔다. 요즘 브라우저는 다른 사이트의 저장소 접근을 막는데, Firebase 문서에 따르면 이 조합에서는 리디렉트 로그인도 영향을 받지 않는다. (`web.app`이나 다른 호스팅이면 팝업만 쓰거나 추가 설정이 필요하다.)
- 로그인 상태는 Auth SDK가 IndexedDB에 보관하므로 오프라인에서 앱을 열어도 로그인된 상태로 캐시 데이터를 쓸 수 있다.
- **허용 사용자 제한:** 누구나 Google 로그인 자체는 할 수 있으므로, 보안 규칙에서 **허용한 UID만** 데이터에 접근하게 해 무료 한도를 남이 쓰지 못하게 막는다 (3.9).
- Firebase 설정값(`apiKey` 등)은 공개돼도 되는 값이다(비밀 키가 아님). 보호는 보안 규칙과 승인된 도메인으로 한다. `index.html` 상단 상수 `FIREBASE_CONFIG`에 둔다.

### 3.8 오프라인 앱 셸 (서비스 워커)

| 요청 | 전략 |
|---|---|
| `index.html`, `manifest.webmanifest` | 네트워크 우선, 실패하면 캐시 (새 버전을 바로 받기 위해) |
| 아이콘, 버전 고정된 Firebase SDK 파일 | 캐시 우선 (버전이 URL에 있어 바뀌지 않음) |
| Firestore·Auth 통신, 파비콘 | 가로채지 않음 (SDK가 오프라인을 직접 처리) |

- 캐시 이름에 버전을 넣고(`jdrbm-v5` 등), 릴리스할 때마다 올린다. 이전 캐시는 `activate`에서 지운다.
- 서비스 워커는 `https://`와 `localhost`에서만 동작한다. `file://`로 열면 오프라인 셸이 없다(로컬 모드는 여전히 동작).
- `manifest.webmanifest`: `name`, `short_name`, `start_url: "./"`, `display: "standalone"`, 테마 색, 아이콘 192·512.

### 3.9 Firestore 보안 규칙 (초안)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAllowedOwner(uid) {
      return request.auth != null
        && request.auth.uid == uid
        && uid in ['<허용할 UID>'];   // 설정 단계(4장 5번)에서 채움
    }

    function isValidBookmark(d) {
      return d.keys().hasOnly(['title', 'url', 'category', 'addedAt', 'order', 'updatedAt'])
        && d.keys().hasAll(['title', 'url', 'category', 'addedAt', 'order', 'updatedAt'])
        && d.title is string && d.title.size() > 0 && d.title.size() <= 500
        && d.url is string && d.url.size() <= 2048 && d.url.matches('https?://.+')
        && d.category is string && d.category.size() <= 100
        && (d.addedAt == null || d.addedAt is int)
        && d.order is number
        && d.updatedAt == request.time;
    }

    match /users/{uid}/bookmarks/{bookmarkId} {
      allow read, delete: if isAllowedOwner(uid);
      allow create, update: if isAllowedOwner(uid) && isValidBookmark(request.resource.data);
    }
  }
}
```

- 이 밖의 경로는 모두 거부된다 (규칙에 없으면 기본 거부).
- 규칙은 `firestore.rules`로 저장소에 두고 배포 때 함께 올린다.

### 3.10 JSON 백업·복구와 HTML 내보내기

- 형식은 바꾸지 않는다. 지금 백업 파일을 클라우드 모드에서도 복구할 수 있고, 클라우드 모드의 백업 파일도 로컬 모드에서 복구할 수 있다.
- 클라우드 모드의 복구 덮어쓰기는 `replaceAll`, 병합은 `mergeAll`을 쓴다.

### 3.11 첫 로그인 때 로컬 데이터 옮기기

| 클라우드 | 로컬 | 동작 |
|---|---|---|
| 비어 있음 | 시드 데이터만 있거나 비어 있음 | 아무것도 하지 않음 (빈 목록으로 시작) |
| 비어 있음 | 사용자 데이터 있음 | "이 기기의 북마크 N개를 계정에 올릴까요?" → 확인하면 `mergeAll` |
| 데이터 있음 | 사용자 데이터 있음 | "이 기기의 북마크 N개를 계정 목록에 합칠까요?" → 확인하면 `mergeAll` (ID 충돌은 D-014 규칙대로 새로 발급) |
| 데이터 있음 | 시드 데이터만 | 클라우드 목록을 그대로 씀 |

- 기기마다 한 번만 묻는다 (`single_file_bookmarks_migrated_<uid>` 키에 기록).
- 로컬 `localStorage` 데이터는 지우지 않는다 (로그아웃 시 로컬 모드용).
- "시드 데이터만"의 판단: ID 1·2·3의 시드 3개와 제목·URL이 모두 같은 경우.

## 4. 무료 한도와 예상 사용량

Spark 요금제 무료 한도 (Firebase 가격 페이지, 2026-09-29 확인). **한도는 프로젝트마다 따로** 적용된다.

| 서비스 | 무료 한도 | 이 앱의 예상 사용량 (북마크 500개, 기기 3대, 하루 20번 열기) |
|---|---|---|
| Firestore 저장 | 1 GiB | 약 0.3 MB |
| Firestore 읽기 | 50,000 / 일 | 최대 약 10,000 / 일 (아래 설명) |
| Firestore 쓰기 | 20,000 / 일 | 수십 / 일 (전체 복구 1회 = 500) |
| Firestore 삭제 | 20,000 / 일 | 수십 / 일 (전체 복구 덮어쓰기 1회 = 500) |
| Firestore 전송 | 10 GiB / 월 | 수십 MB / 월 |
| Auth | 월 활성 사용자 50,000명 | 1명 |
| Hosting 저장 / 전송 | 10 GB / 360 MB·일 | 1 MB 미만 / 수 MB·일 (SDK는 gstatic에서 받으므로 제외) |

- **읽기가 가장 먼저 한도에 닿는다.** 앱을 열 때 리스너가 문서 수만큼 읽는다. 캐시가 있어도 리스너가 30분 넘게 끊겼다가 다시 연결되면 새 쿼리처럼 전부 다시 읽는 것으로 계산된다. 그래서 `북마크 수 × 하루에 앱을 여는 횟수`가 대략의 최대치다. 북마크가 수천 개로 늘면 다시 계산한다.
- 한도를 넘으면 과금되지 않고 그날 요청이 거부된다. 앱은 캐시로 계속 보이고, 쓰기는 대기했다가 다음 날 올라간다.
- Firestore 무료 데이터베이스는 프로젝트당 하나다.

## 5. 사용자가 직접 할 일 (Firebase 콘솔)

계정 생성·로그인·결제 설정은 Claude가 대신할 수 없다. 2단계를 시작하기 전에 아래를 마치고, 4번과 5번 값을 Claude에게 알려 준다.

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트 만들기 (Google 애널리틱스는 꺼도 됨). 요금제는 Spark 그대로 둔다.
2. **Authentication** → 로그인 방법 → **Google** 사용 설정
3. **Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` (나중에 바꿀 수 없음) → **프로덕션 모드**
4. **프로젝트 설정** → 내 앱 → 웹 앱 추가 → 표시되는 `firebaseConfig` 값 (공개돼도 되는 값)
5. 앱에서 한 번 로그인한 뒤 **Authentication → 사용자**에서 내 **UID** 확인 (규칙의 허용 목록에 넣음)
6. 배포 도구: Node.js LTS 설치 → `npm install -g firebase-tools` → `firebase login` (본인 계정으로 직접). 배포는 `firebase deploy` 한 번으로 Hosting과 규칙이 함께 올라간다. (열린 질문 Q3)

## 6. 구현 단계

단계마다 **새 세션 하나, PR 하나**로 진행한다. 각 단계가 끝나면 앱은 항상 쓸 수 있는 상태여야 한다.

| 단계 | 내용 | 완료 조건 |
|---|---|---|
| **1. 저장 계층 분리** (Firebase 없음) | 3.5의 작업 함수와 `store` 인터페이스, LocalStore. `syncAndRender` 호출부를 작업 함수로 교체. 새 ID 규칙(3.4), 제목 길이 제한 | 동작 변화 없음: CLAUDE.md 회귀 테스트 전부 통과 |
| **2. 로그인과 클라우드 동기화** | 사용자가 5장 1~4번 완료 후. Firebase SDK 로드, 로그인/로그아웃 버튼과 계정 표시, CloudStore(`order` 포함), `onSnapshot`, 첫 로그인 이전(3.11), `firestore.rules`, `firebase.json`, Hosting 배포 | PC와 안드로이드에서 추가·수정·삭제·이동이 서로 반영됨. 다른 Google 계정으로는 읽기·쓰기가 거부됨. Firebase를 못 불러와도 로컬 모드로 동작 |
| **3. 오프라인과 설치** | `sw.js`, `manifest.webmanifest`, 아이콘, 동기화 상태 표시(동기화됨 / 오프라인 / 올릴 변경 있음) | 안드로이드에서 홈 화면에 추가됨. 비행기 모드에서 앱을 열고 수정 → 연결 후 PC에 반영됨 |
| **4. 문서와 릴리스** | DECISIONS.md(D-017 확정, D-001 대체), CLAUDE.md 규약(6.1), README 사용법, 회귀 테스트 갱신 | 문서가 코드와 일치. 버전 릴리스 |

### 6.1 CLAUDE.md에 반영할 규약 변경 (4단계, 단계별로 필요한 만큼 먼저 반영해도 됨)
- 단일 파일 원칙 → "빌드 없음. 정적 파일 몇 개. 외부 코드는 버전 고정한 Firebase SDK만."
- "상태를 바꾼 뒤 `syncAndRender()`" → "상태 변경은 작업 함수(3.5)로만."
- Firestore 스냅샷도 외부 입력으로 검증한다.
- 테스트는 로컬 서버(`localhost`)에서 한다 (모듈 스크립트·서비스 워커·로그인 때문에 `file://`로는 부족함).

## 7. 열린 질문 (구현 전에 정할 것)

| # | 질문 | 제안 |
|---|---|---|
| Q1 | 로그아웃했을 때 무엇을 보여 줄까 | 로그인 전 로컬 목록. 클라우드 캐시는 지움 |
| Q2 | 쓸 Google 계정은 몇 개인가 (허용 UID 목록) | 1개 |
| Q3 | 배포 방식 | PC에 Node.js + Firebase CLI를 설치해 직접 배포. (GitHub Actions 자동 배포는 나중에) |
| Q4 | 주소 | `<프로젝트>.firebaseapp.com` (3.7의 이유). 커스텀 도메인은 쓰지 않음 |
| Q5 | `file://`로 여는 사용법을 유지할까 | 로컬 모드로만 유지 (동기화·오프라인 셸 없음) |

## 8. 위험과 대응

| 위험 | 대응 |
|---|---|
| Firebase 정책이나 무료 한도가 바뀜 | JSON 백업·HTML 내보내기 유지 → 언제든 다른 방식으로 옮길 수 있음 |
| 고정한 SDK 버전이 오래됨 | 릴리스 때 버전을 확인해 올림. 서비스 워커 캐시 이름도 함께 올림 |
| 서비스 워커 캐시 때문에 새 버전이 늦게 보임 | `index.html`은 네트워크 우선 |
| 규칙과 앱의 검증이 어긋나 서버가 쓰기를 거부 | 두 곳의 검증 조건을 이 문서 3.4·3.9에 맞추고, 쓰기 오류를 사용자에게 알림 |
| 무료 한도 초과 (특히 읽기) | 4장의 계산을 기준으로, 북마크 수가 크게 늘면 다시 검토 |
