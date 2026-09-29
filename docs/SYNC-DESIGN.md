# 여러 기기 동기화 설계 (Firebase)

- **상태:** 확정 (2026-09-29) — 6장의 단계 순서대로 구현한다. 7장에 확정된 답을 적었다.
- **수명:** 구현을 위한 임시 문서다. 마지막 4단계에서 필요한 내용을 DECISIONS.md·CLAUDE.md·README로 옮기고 **이 문서는 삭제한다** (6.3).
- **작성일:** 2026-09-29
- **기준 코드:** v0.4 (커밋 `709799d`). 함수 이름은 그 시점 `index.html` 기준.
- **관련 결정:** DECISIONS.md D-017 (이 문서를 가리킴), D-001 (D-017로 대체됨)

---

## 1. 요구사항과 범위

| 요구사항 | 내용 |
|---|---|
| 여러 기기 | PC 브라우저와 **안드로이드 폰**(크롬)에서 같은 목록을 쓴다 |
| 로그인 | Google 계정 로그인 |
| 오프라인 | 네트워크 없이도 **앱 열기·조회·추가·수정·삭제·순서 변경**이 되고, 연결되면 자동으로 동기화된다 |
| 비용 | Firebase **Spark(무료) 요금제** 안에서만 쓴다. 결제 수단을 등록하지 않는다 |
| 호스팅 | 처음에는 **GitHub Pages**(공개 저장소). 나중에 Firebase Hosting·Cloudflare Pages·Netlify·Vercel로 **코드 수정 없이** 옮길 수 있어야 한다 (3.12) |

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
        앱 파일 받기 ▲         │ 연결되면 자동 동기화
┌───────────────────┴──────┐  ┌──────────┴───────────────────────────┐
│ 정적 호스팅               │  │ Firebase 프로젝트 (Spark)             │
│ GitHub Pages (처음)       │  │  Auth     : Google 제공업체            │
│ jaydrobin.github.io/      │  │  Firestore: users/{uid}/bookmarks/{id} │
│   jdrbmmanager/           │  │  (Hosting은 쓰지 않음, 3.12)           │
└──────────────────────────┘  └──────────────────────────────────────┘
```

- 호스팅은 파일만 내려 준다. 로그인과 데이터는 호스팅과 상관없이 Firebase가 맡는다.

## 3. 설계 결정

### 3.1 Firebase(Auth + Firestore)를 쓴다

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
| `firestore.rules` | Firestore 보안 규칙 (3.9). 호스팅과 따로, Firebase 콘솔에 붙여넣어 적용 |

- 호스팅 전용 설정 파일(`firebase.json`, `netlify.toml`, `vercel.json` 등)은 **두지 않는다.** 없어도 동작해야 한다 (3.12). 나중에 그 호스팅으로 옮길 때만 추가한다.

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
- 로그아웃하면 로컬 모드로 돌아가 **로그인 전 로컬 목록**이 보인다. 클라우드 캐시(IndexedDB)는 로그아웃할 때 지운다 (`terminate` → `clearIndexedDbPersistence`). (7장 Q1)

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
  - (1단계 구현) 넘는 제목은 항목을 버리지 않고 500자로 **잘라낸다**(`truncateTitle`, 기존 데이터를 잃지 않도록). 모달 입력란은 `maxlength="500"`. 길이는 JS `length`(UTF-16 단위) 기준이라 규칙의 `size()`가 세는 방식과 같은지 2단계에서 확인한다.
  - URL(2048자)·카테고리(100자) 제한은 1단계에서 앱에 넣지 않았다. 2단계에서 규칙과 함께 정한다 (긴 URL은 잘라낼 수 없으므로 거부할지 규칙을 늘릴지).

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
- (1단계 구현) `store` 메서드: `add(item)`, `update(id, fields)`, `remove(id)`, `move(id, toIndex)`, `replaceAll(list)`, `mergeAll(list)`. 배열을 바꾼 **뒤에** 호출되므로 CloudStore는 `bookmarks`에서 옮긴 항목의 새 이웃을 찾아 `order`를 계산할 수 있다. `moveBookmark`의 `toIndex`는 옮긴 뒤 전체 배열에서의 위치다.
- (1단계 구현) 이동 버튼 처리 함수는 이름이 겹쳐 `moveBookmarkBy(id, direction)`로 바꿨다. `mergeAll`은 ID 충돌 처리가 끝난 목록(`sanitizeBookmarks(list, bookmarks)`)을 받는다.
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

- Google 제공업체. **어느 호스팅에서든 `signInWithPopup`이 기본**이다. `authDomain`은 `<프로젝트>.firebaseapp.com` 그대로 둔다.
- 요즘 브라우저는 다른 사이트의 저장소 접근을 막기 때문에, 앱 주소와 `authDomain`이 다르면 리디렉트 로그인(`signInWithRedirect`)이 실패할 수 있다(Firebase 문서). 그래서 **리디렉트는 앱 주소가 `authDomain`과 같을 때만**(= 나중에 Firebase Hosting의 `firebaseapp.com` 주소로 옮겼을 때) 팝업이 막혔을 때의 대체 수단으로 쓴다. 판단은 `location.hostname === FIREBASE_CONFIG.authDomain` 한 줄.
- 팝업이 막혔는데 리디렉트를 쓸 수 없으면 "팝업을 허용해 주세요" 알림을 띄운다.
- 앱을 올린 주소는 Firebase 콘솔의 **승인된 도메인**에 있어야 로그인이 된다 (5장).
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
- 서비스 워커는 `./sw.js`로 등록해 **앱 폴더 범위**(`/jdrbmmanager/`)만 다룬다. 같은 주소의 다른 앱 페이지를 가로채지 않는다.
- `manifest.webmanifest`: `name`, `short_name`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, 테마 색, 아이콘 192·512.

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
- 규칙은 `firestore.rules`로 저장소에 두고, 바꿀 때마다 **Firebase 콘솔 → Firestore → 규칙**에 붙여넣어 게시한다. (Firebase CLI를 쓰게 되면 `firebase deploy --only firestore:rules`로 대신할 수 있다.)
- 허용 UID는 공개 저장소에 올라가도 된다. UID만으로는 로그인할 수 없다.

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

### 3.12 호스팅 이식성

처음에는 GitHub Pages에 올리고, 나중에 다른 정적 호스팅으로 **앱 코드를 고치지 않고** 옮길 수 있게 한다.

| 원칙 | 이유 |
|---|---|
| 앱 안의 모든 경로는 **상대 경로** (`./sw.js`, `./manifest.webmanifest`, `start_url: "./"`, 아이콘) | GitHub Pages는 하위 경로(`/jdrbmmanager/`), 다른 호스팅은 루트(`/`)에서 서비스된다 |
| 로그인은 **팝업이 기본** (3.7) | 호스팅 주소가 `authDomain`과 달라도 동작한다 |
| 호스팅 전용 기능(주소 다시 쓰기, 응답 헤더, 리디렉트 설정)에 **의존하지 않는다** | 설정 파일 없이 어디서든 동작한다 |
| 보안 규칙은 **호스팅과 따로** 관리 (3.9) | 호스팅을 바꿔도 규칙은 그대로 |

**호스팅을 옮길 때 할 일** (앱 코드 변경 없음)
1. 새 호스팅에 저장소를 연결하거나 파일을 올린다.
2. Firebase 콘솔 → Authentication → 설정 → **승인된 도메인**에 새 주소를 추가한다.
3. (Firebase Hosting으로 옮길 때만) `firebase.json` 설정 파일을 추가하고 배포 도구를 준비한다. 배포 도구는 앱 코드가 아니다: PC에 Node.js와 Firebase CLI를 설치해 `firebase deploy`로 올리거나, GitHub Actions 작업 파일을 추가해 GitHub 서버에서 올린다(PC 설치 불필요). `firebaseapp.com` 주소로 옮기면 3.7의 조건에 따라 리디렉트 로그인도 자동으로 쓸 수 있게 된다.

- 클라우드 모드 데이터는 Firestore에 있으므로 새 주소에서 로그인하면 그대로 보인다. **로컬 모드 데이터와 오프라인 캐시는 주소(출처)마다 따로라 따라오지 않는다** → 옮기기 전에 로컬 모드로만 쓴 데이터는 JSON 백업으로 옮긴다.

### 3.13 같은 주소(출처)를 쓰는 다른 페이지

GitHub Pages는 `jaydrobin.github.io` 아래 모든 저장소의 페이지가 **같은 출처**다. 브라우저는 저장 공간(`localStorage`, IndexedDB)을 출처 단위로 나누므로 이 페이지들은 저장 공간을 함께 쓴다.

| 영향 | 판단 |
|---|---|
| 다른 페이지의 스크립트가 이 앱의 로그인 정보(IndexedDB)와 북마크를 읽을 수 있음 | 모두 본인 페이지라면 문제없음. **다른 페이지에 신뢰할 수 없는 외부 스크립트(광고·분석 등)를 넣지 않는다.** 그런 페이지가 필요하면 이 앱을 다른 출처로 옮긴다 (3.12) |
| 저장소 키 충돌 | 키에 `single_file_bookmarks_` 접두어를 쓰므로 없음. Firebase의 저장 공간은 프로젝트별로 이름이 달라 다른 Firebase 앱과 겹치지 않음 |
| 서비스 워커 충돌 | 앱 폴더 범위로만 등록하므로 없음 (3.8). 단, 사용자 사이트 저장소(`jaydrobin.github.io`)의 루트에 서비스 워커를 두면 모든 하위 경로를 가로챌 수 있으니 두지 않는다 |
| 브라우저에서 이 사이트 데이터를 지우면 같은 출처의 모든 앱 데이터가 함께 지워짐 | 클라우드 모드 데이터는 Firestore에 남음. 다시 로그인하면 복구됨 |

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
| Hosting | (쓰지 않음. GitHub Pages 사용) | - |

- **읽기가 가장 먼저 한도에 닿는다.** 앱을 열 때 리스너가 문서 수만큼 읽는다. 캐시가 있어도 리스너가 30분 넘게 끊겼다가 다시 연결되면 새 쿼리처럼 전부 다시 읽는 것으로 계산된다. 그래서 `북마크 수 × 하루에 앱을 여는 횟수`가 대략의 최대치다. 북마크가 수천 개로 늘면 다시 계산한다.
- 한도를 넘으면 과금되지 않고 그날 요청이 거부된다. 앱은 캐시로 계속 보이고, 쓰기는 대기했다가 다음 날 올라간다.
- Firestore 무료 데이터베이스는 프로젝트당 하나다.

## 5. 사용자가 직접 할 일 (GitHub·Firebase 콘솔)

계정 생성·로그인·결제 설정은 Claude가 대신할 수 없다. **PC에 설치할 도구는 없다** (Node.js 불필요).

**2단계를 시작하기 전에** (1~5번을 마치고 4번 값을 Claude에게 알려 준다)
1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트 만들기 (Google 애널리틱스는 꺼도 됨). 요금제는 Spark 그대로 둔다.
2. **Authentication** → 로그인 방법 → **Google** 사용 설정
3. **Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` (나중에 바꿀 수 없음) → **프로덕션 모드**
4. **프로젝트 설정** → 내 앱 → 웹 앱 추가 (Firebase Hosting 설정은 체크하지 않음) → 표시되는 `firebaseConfig` 값 (공개돼도 되는 값)
5. **Authentication** → 설정 → **승인된 도메인**에 `jaydrobin.github.io` 추가 (`localhost`는 기본으로 들어 있음)
6. GitHub 저장소 → **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main`, 폴더 `/ (root)` → 저장. 이후 `main`에 머지할 때마다 `https://jaydrobin.github.io/jdrbmmanager/`에 자동 배포된다. (지금 켜도 된다. 그때는 `main`의 현재 버전이 배포된다. 폰 테스트 때 브랜치를 바꾸는 방법은 6.2)

**2단계 도중에** (Claude가 요청하면)
7. 앱에서 한 번 로그인한 뒤 **Authentication → 사용자**에서 내 **UID**를 확인해 알려 준다 (규칙의 허용 목록에 넣음).
8. Claude가 만든 `firestore.rules` 내용을 **Firestore → 규칙**에 붙여넣고 게시한다.

- 저장소 루트 전체가 공개 사이트로 배포되므로 `CLAUDE.md`, `docs/` 등도 주소로 열 수 있다. 비밀 정보는 없으므로 수용한다. 저장소에 비밀 값(서비스 계정 키 등)을 넣지 않는다.

## 6. 구현 단계

모든 단계를 **브랜치 하나, 초안 PR 하나**에서 진행하고, 단계마다 커밋을 나눈다 (진행 방식은 6.2). 단계마다 새 세션을 써도 된다. 각 단계의 커밋이 끝나면 앱은 그 시점에서도 쓸 수 있는 상태여야 한다 (커밋 단위로 되돌릴 수 있게).

| 단계 | 내용 | 완료 조건 |
|---|---|---|
| **1. 저장 계층 분리** (Firebase 없음) | 3.5의 작업 함수와 `store` 인터페이스, LocalStore. `syncAndRender` 호출부를 작업 함수로 교체. 새 ID 규칙(3.4), 제목 길이 제한 | 동작 변화 없음: CLAUDE.md 회귀 테스트 전부 통과 |
| **2. 로그인과 클라우드 동기화** | 사용자가 5장 1~6번 완료 후. Firebase SDK 로드, 로그인/로그아웃 버튼과 계정 표시(팝업 기본, 3.7), CloudStore(`order` 포함), `onSnapshot`, 첫 로그인 이전(3.11), `firestore.rules`(사용자가 콘솔에 게시) | GitHub Pages 주소에서 PC와 안드로이드의 추가·수정·삭제·이동이 서로 반영됨. 다른 Google 계정으로는 읽기·쓰기가 거부됨. Firebase를 못 불러와도 로컬 모드로 동작 |
| **3. 오프라인과 설치** | `sw.js`, `manifest.webmanifest`, 아이콘(모두 상대 경로, 3.12), 동기화 상태 표시(동기화됨 / 오프라인 / 올릴 변경 있음) | 안드로이드에서 홈 화면에 추가됨. 비행기 모드에서 앱을 열고 수정 → 연결 후 PC에 반영됨. `localhost` 루트 경로에서도 같은 동작(이식성 확인) |
| **4. 문서 통합과 릴리스** | 이 설계도의 내용을 6.3의 표대로 옮기고 **이 문서를 삭제**. CLAUDE.md 규약(6.1)과 회귀 테스트 갱신, README에 사용법·설치·배포 절 추가. 초안 PR을 검토 준비 완료로 바꿈 | 6.3의 완료 조건을 만족. 머지 커밋 제목은 버전(`vX.Y`) |

### 6.1 CLAUDE.md에 반영할 규약 변경 (4단계, 단계별로 필요한 만큼 먼저 반영해도 됨)
- 단일 파일 원칙 → "빌드 없음. 정적 파일 몇 개. 외부 코드는 버전 고정한 Firebase SDK만."
- "상태를 바꾼 뒤 `syncAndRender()`" → "상태 변경은 작업 함수(3.5)로만."
- Firestore 스냅샷도 외부 입력으로 검증한다.
- 테스트는 로컬 서버(`localhost`)에서 한다 (모듈 스크립트·서비스 워커·로그인 때문에 `file://`로는 부족함).
- 앱 안의 경로는 상대 경로로, 호스팅 전용 기능에 의존하지 않는다 (3.12).

### 6.2 진행 방식: 단계별 커밋, 초안 PR, 폰 테스트 때 배포 브랜치 전환

**이유:** GitHub Pages가 `main`을 자동 배포하므로, 완성 전의 기능이 공개 주소에 올라가지 않도록 모든 단계가 끝난 뒤 한 번에 머지한다. 대신 커밋을 단계별로 나눠 검토와 되돌리기를 쉽게 한다.

**브랜치와 PR**
- 브랜치: `feat/multi-device-sync` (`main`에서 만든다)
- 1단계 첫 커밋을 올린 뒤 **초안(draft) PR**을 연다. PR 본문에 단계 체크리스트(1~4단계)를 두고, 단계가 끝날 때마다 체크한다. 새 세션은 `gh pr view`로 진행 상황을 확인한다.
- 커밋 메시지는 단계 번호로 시작한다. 예: `1단계: 상태 변경을 작업 함수로 분리`. 한 단계가 여러 커밋이어도 되지만 **한 커밋이 두 단계에 걸치지 않게** 한다.
- 새 세션에서 이어 갈 때의 요청 예: "`feat/multi-device-sync` 브랜치에서 docs/SYNC-DESIGN.md 6장의 2단계를 이어서 진행해줘."
- 구현 중 설계를 바꿔야 하면 같은 브랜치에서 이 문서도 함께 고친다 (바꾼 이유를 커밋 메시지에 적는다).
- 4단계가 끝나면 PR을 **검토 준비 완료(ready for review)**로 바꾸고, 사용자가 검토 후 머지한다.

**폰 테스트 때 배포 브랜치 전환** (2·3단계의 안드로이드 확인용)
1. 확인할 커밋을 브랜치에 푸시한다.
2. GitHub 저장소 → Settings → Pages → Branch를 `feat/multi-device-sync`로 바꾸고 저장한다 (반영까지 1~2분).
3. 폰과 PC에서 `https://jaydrobin.github.io/jdrbmmanager/`로 테스트한다. 주소(출처)가 같으므로 승인된 도메인 설정과 로컬 데이터가 그대로 쓰인다.
4. 테스트가 끝나면 Branch를 `main`으로 되돌린다. PR을 머지한 뒤에도 `main`인지 다시 확인한다.

- 전환해 둔 동안에는 공개 주소에 작업 중인 코드가 올라간다. 개인용이므로 수용하되, 테스트가 끝나면 바로 되돌린다.
- 서비스 워커(3단계)가 들어간 뒤에는 되돌린 직후 폰에 이전 캐시가 남아 있을 수 있다. 앱을 한 번 새로고침하거나 다시 열면 `index.html`(네트워크 우선)부터 새 버전으로 바뀐다.
- PC의 동작 확인은 브랜치 전환 없이 `localhost`에서 한다 (6.1).

### 6.3 설계도 통합과 삭제 (4단계)

구현이 끝난 설계도는 코드와 어긋나기 쉬우므로, 필요한 내용을 현재 상태 문서로 옮기고 이 파일을 지운다. 지운 내용은 Git 기록에 남는다.

| 이 문서의 내용 | 옮길 곳 |
|---|---|
| 결정과 이유: Firebase 선택(3.1), 파일 구성(3.2), 두 모드(3.3), 충돌 규칙(3.6), 로그인(3.7), 오프라인 셸(3.8), 호스팅 이식성(3.12), 같은 출처 공유(3.13) | DECISIONS.md 4장. D-017을 보완하거나 D-018 이후의 결정으로 나눈다 |
| 데이터 모델, 저장소 키, Firestore 경로와 필드(3.4) | DECISIONS.md 3장 |
| 기능: 로그인·동기화·오프라인·홈 화면 설치·첫 로그인 이전(3.11) | DECISIONS.md 2장, README |
| 코드 규약(6.1), 작업 함수 규칙(3.5) | CLAUDE.md (작성 규약, 구조 표, 체크리스트, 회귀 테스트) |
| 보안 규칙(3.9) | `firestore.rules` 파일. DECISIONS.md에는 "허용 UID만 접근" 결정만 남긴다 |
| 사용자가 할 일(5장), 호스팅 옮기는 절차(3.12), 폰 테스트 방법(6.2) | README의 "설치·배포" 절 |
| 무료 한도 계산(4장), 위험(8장) | D-017의 "결과"와 DECISIONS.md 5장(알려진 문제·한계)에 요약 |
| 단계 계획(6장 표), 확정된 질문(7장) | 옮기지 않음 (완료되면 필요 없음) |

**완료 조건**
- `docs/SYNC-DESIGN.md`가 삭제됐고, 저장소 어디에도 이 파일을 가리키는 링크가 없다 (`SYNC-DESIGN`으로 검색해 확인).
- DECISIONS.md·CLAUDE.md·README만 읽고도 새 세션이 앱 구조, 저장 방식, 규약, 배포 방법을 알 수 있다.
- D-017의 상태와 "결과"가 실제 구현과 일치한다. 구현하면서 바뀐 결정이 있으면 반영됐다.

## 7. 확정된 질문

| # | 질문 | 결정 |
|---|---|---|
| Q1 | 로그아웃했을 때 무엇을 보여 줄까 | 로그인 전 로컬 목록. 클라우드 캐시는 지움 |
| Q2 | 쓸 Google 계정은 몇 개인가 (허용 UID 목록) | 1개. 계정마다 목록이 따로(`users/{uid}`)이므로 모든 기기에서 같은 계정으로 로그인한다. 나중에 UID를 규칙에 추가하면 다른 계정도 허용할 수 있다(그 계정은 자기만의 목록을 쓰고, 무료 한도를 함께 씀) |
| Q3 | 배포 방식 | GitHub Pages가 `main` 브랜치를 자동 배포. 보안 규칙은 Firebase 콘솔에 붙여넣기. PC 도구 설치 없음 |
| Q4 | 주소 | `https://jaydrobin.github.io/jdrbmmanager/` (공개 저장소). 다른 호스팅으로는 3.12대로 옮긴다 |
| Q5 | `file://`로 여는 사용법을 유지할까 | 로컬 모드로만 유지 (동기화·오프라인 셸 없음) |

## 8. 위험과 대응

| 위험 | 대응 |
|---|---|
| Firebase 정책이나 무료 한도가 바뀜 | JSON 백업·HTML 내보내기 유지 → 언제든 다른 방식으로 옮길 수 있음 |
| 고정한 SDK 버전이 오래됨 | 릴리스 때 버전을 확인해 올림. 서비스 워커 캐시 이름도 함께 올림 |
| 서비스 워커 캐시 때문에 새 버전이 늦게 보임 | `index.html`은 네트워크 우선 |
| 규칙과 앱의 검증이 어긋나 서버가 쓰기를 거부 | 두 곳의 검증 조건을 이 문서 3.4·3.9에 맞추고, 쓰기 오류를 사용자에게 알림 |
| 무료 한도 초과 (특히 읽기) | 4장의 계산을 기준으로, 북마크 수가 크게 늘면 다시 검토 |
| 같은 출처(`jaydrobin.github.io`)의 다른 페이지가 데이터를 읽음 | 그 페이지들에 신뢰할 수 없는 외부 스크립트를 넣지 않음. 필요해지면 다른 출처로 옮김 (3.13, 3.12) |
| 팝업 로그인이 막힘 | 팝업 허용 안내. Firebase Hosting의 `firebaseapp.com`으로 옮기면 리디렉트 대체 가능 (3.7) |
| 한 PR이 커서 검토가 어려움 | 단계별 커밋으로 나누고 커밋 단위로 검토 (6.2) |
| 폰 테스트용 배포 브랜치를 `main`으로 되돌리는 것을 잊음 | 6.2의 4번. 머지 후 Pages 설정을 다시 확인 |
