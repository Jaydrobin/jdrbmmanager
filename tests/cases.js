/* 자동 회귀 시험 목록 (DECISIONS.md D-027). 묶음 이름은 CLAUDE.md 코드 점검 규약 3의 회귀 번호, '점검'은 체크리스트 항목.
   시험은 화면 조작이나 앱의 전역 함수로만 상태를 바꾸고, app.state(__app)는 읽기에만 쓴다.
   시험마다 이 출처의 localStorage가 비워진 채로 시작한다. 하네스 API는 run.html. */

const SEED_TITLES = ['Google', 'GitHub', 'YouTube'];
const STORAGE_KEY = 'single_file_bookmarks_v3';

function stored(key = STORAGE_KEY) {
  return JSON.parse(localStorage.getItem(key));
}

// 모달로 북마크를 추가한다 (Enter 저장과 같은 requestSubmit).
function addViaModal(app, { title, url, category = '' }) {
  app.click('[onclick="openModal()"]');
  app.type('#bmTitle', title);
  app.type('#bmUrl', url);
  app.type('#bmCategory', category);
  app.$('#bookmarkForm').requestSubmit();
}

/* ---------- 점검: 시험 환경 ---------- */
test('점검', '시험 중에는 클라우드·서비스 워커를 켜지 않는다', async t => {
  const app = await t.open();
  eq(app.win.location.protocol, 'about:', 'srcdoc 앱의 프로토콜');
  eq(app.state.firebase, null, 'Firebase SDK를 불러오지 않음');
  ok(app.$('#authBtn').hidden, '로그인 버튼이 숨겨짐');
  const registrations = await navigator.serviceWorker.getRegistrations();
  eq(registrations.length, 0, '시험 출처의 서비스 워커 등록 수');
});

/* ---------- 1. 시드 ---------- */
test('1', '시드 북마크 3개가 보인다', async t => {
  const app = await t.open();
  eq(app.titles(), SEED_TITLES, '목록');
  eq(app.cardTitles(), SEED_TITLES, '화면의 카드');
});

test('1', '깨진 저장값(JSON 아님·배열 아님)은 시드로 시작하고 원문을 _broken 키에 보관한다 (D-014)', async t => {
  for (const broken of ['not json', '{"a":1}']) {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, broken);
    const app = await t.open();
    eq(app.titles(), SEED_TITLES, `${broken}: 목록`);
    eq(localStorage.getItem(STORAGE_KEY + '_broken'), broken, `${broken}: _broken 키`);
    app.close();
  }
});

/* ---------- 2. 추가 ---------- */
test('2', 'example.com 입력 후 Enter → https://example.com으로 맨 앞에 저장', async t => {
  const app = await t.open();
  const before = Date.now();
  addViaModal(app, { title: '예제', url: 'example.com' });
  const first = app.state.bookmarks[0];
  eq(first.url, 'https://example.com', '보정된 주소');
  eq(first.title, '예제', '제목');
  ok(first.addedAt >= before && first.addedAt <= Date.now(), `추가 시각이 지금 (${first.addedAt})`);
  eq(app.cardTitles()[0], '예제', '첫 카드');
  eq(stored()[0].url, 'https://example.com', '저장된 첫 항목');
  ok(!app.modalOpen(), '저장 뒤 모달이 닫힘');
});

test('2', '빈 칸으로 Enter → 저장되지 않음', async t => {
  const app = await t.open();
  app.click('[onclick="openModal()"]');
  app.$('#bookmarkForm').requestSubmit();
  eq(app.titles(), SEED_TITLES, '목록');
  eq(localStorage.getItem(STORAGE_KEY), null, '저장 안 됨');
  ok(app.modalOpen(), '모달이 열린 채');
});

test('2', 'Esc → 모달이 닫힘', async t => {
  const app = await t.open();
  app.click('[onclick="openModal()"]');
  ok(app.modalOpen(), '모달이 열림');
  app.pressKey('Escape');
  ok(!app.modalOpen(), 'Esc 뒤 모달이 닫힘');
});

/* ---------- 변이 점검 (3.8): 앱 원문에 알려진 결함을 하나씩 넣는다. 하나 이상의 시험이 실패해야 한다 ---------- */
const MUTANTS = [];
