/* 자동 회귀 시험 목록 (DECISIONS.md D-027). 묶음 이름은 CLAUDE.md 코드 점검 규약 3의 회귀 번호, '점검'은 체크리스트 항목.
   시험은 화면 조작이나 앱의 전역 함수로만 상태를 바꾸고, app.state(__app)는 읽기에만 쓴다.
   시험마다 이 출처의 localStorage가 비워진 채로 시작한다. 하네스 API는 run.html. */

const SEED_TITLES = ['Google', 'GitHub', 'YouTube'];
const STORAGE_KEY = 'single_file_bookmarks_v3';

function stored(key = STORAGE_KEY) {
  return JSON.parse(localStorage.getItem(key));
}

function setStored(list, key = STORAGE_KEY) {
  localStorage.setItem(key, JSON.stringify(list));
}

function cardButton(app, title, action) {
  return app.card(title).querySelector(`[data-action="${action}"]`);
}

function selectCategory(app, value) {
  const select = app.$('#categoryFilter');
  select.value = value;
  select.dispatchEvent(new app.win.Event('change', { bubbles: true }));
}

function drag(app, fromTitle, toTitle) {
  const from = app.card(fromTitle);
  const to = app.card(toTitle);
  const transfer = new app.win.DataTransfer();
  const fire = (target, type) => target.dispatchEvent(new app.win.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  fire(from, 'dragstart');
  fire(to, 'dragover');
  fire(to, 'drop');
  fire(from, 'dragend');
}

function lastDialog(app) {
  return app.dialogs[app.dialogs.length - 1];
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

/* ---------- 3. 수정·삭제 ---------- */
test('3', '수정 → 값이 바뀌고 추가 시각은 유지된다', async t => {
  setStored([{ id: 10, title: '수정 전', url: 'https://before.example', category: '가', addedAt: 1700000000000 }]);
  const app = await t.open();
  app.click(cardButton(app, '수정 전', 'edit'));
  ok(app.modalOpen(), '모달이 열림');
  eq(app.$('#modalTitle').textContent, '북마크 수정', '모달 제목');
  eq([app.$('#bmTitle').value, app.$('#bmUrl').value, app.$('#bmCategory').value], ['수정 전', 'https://before.example', '가'], '채워진 값');
  app.type('#bmTitle', '수정 후');
  app.type('#bmUrl', 'after.example');
  app.type('#bmCategory', '나');
  app.$('#bookmarkForm').requestSubmit();
  eq(app.state.bookmarks, [{ id: 10, title: '수정 후', url: 'https://after.example', category: '나', addedAt: 1700000000000 }], '목록');
  eq(stored(), app.state.bookmarks, '저장된 목록');
  ok(!app.modalOpen(), '저장 뒤 모달이 닫힘');
});

test('3', '삭제 → 확인하면 사라지고 취소하면 남는다', async t => {
  const app = await t.open();
  app.answerConfirm(false);
  app.click(cardButton(app, 'GitHub', 'delete'));
  eq(app.titles(), SEED_TITLES, '취소 뒤 목록');
  eq(app.dialogs, [{ type: 'confirm', message: '이 북마크를 삭제하시겠습니까?' }], '확인 창');
  app.answerConfirm(true);
  app.click(cardButton(app, 'GitHub', 'delete'));
  eq(app.titles(), ['Google', 'YouTube'], '확인 뒤 목록');
  eq(stored().map(bm => bm.title), ['Google', 'YouTube'], '저장된 목록');
});

/* ---------- 4. 검색·필터 ---------- */
test('4', '검색: 제목·URL 부분 일치, 대소문자 무시', async t => {
  const app = await t.open();
  app.type('#searchInput', 'git');
  eq(app.cardTitles(), ['GitHub'], '"git"');
  app.type('#searchInput', 'YOUTUBE.COM');
  eq(app.cardTitles(), ['YouTube'], '"YOUTUBE.COM" (주소)');
  app.type('#searchInput', '없는 말');
  eq(app.cardTitles(), [], '일치 없음');
  ok(app.$('#bookmarkGrid').textContent.includes('북마크가 없습니다.'), '빈 목록 문구');
  app.type('#searchInput', '');
  eq(app.cardTitles(), SEED_TITLES, '검색어를 지우면 전체');
});

test('4', '카테고리 필터: 현재 북마크의 카테고리로 목록을 만들고 거른다', async t => {
  const app = await t.open();
  eq(app.$$('#categoryFilter option').map(o => o.value), ['all', '검색', '개발', '미디어'], '선택 목록');
  selectCategory(app, '개발');
  eq(app.cardTitles(), ['GitHub'], '"개발"');
  selectCategory(app, 'all');
  eq(app.cardTitles(), SEED_TITLES, '전체');
});

test('4', '필터 중 그 카테고리의 마지막 항목을 지우면 필터가 전체로 돌아간다 (K-07)', async t => {
  const app = await t.open();
  selectCategory(app, '개발');
  app.answerConfirm(true);
  app.click(cardButton(app, 'GitHub', 'delete'));
  eq(app.$('#categoryFilter').value, 'all', '필터');
  eq(app.$$('#categoryFilter option').map(o => o.value), ['all', '검색', '미디어'], '선택 목록');
  eq(app.cardTitles(), ['Google', 'YouTube'], '화면');
});

/* ---------- 5. 순서 변경 ---------- */
test('5', '[←]/[→] 버튼으로 이동하고 포커스가 유지된다. 맨 앞·맨 뒤 버튼은 비활성', async t => {
  const app = await t.open();
  ok(cardButton(app, 'Google', 'move-prev').disabled, '맨 앞의 [←] 비활성');
  ok(cardButton(app, 'YouTube', 'move-next').disabled, '맨 뒤의 [→] 비활성');
  app.click(cardButton(app, 'Google', 'move-next'));
  eq(app.titles(), ['GitHub', 'Google', 'YouTube'], '[→] 뒤 목록');
  eq(app.doc.activeElement, cardButton(app, 'Google', 'move-next'), '포커스가 옮긴 카드의 [→]');
  app.click(cardButton(app, 'Google', 'move-next'));
  eq(app.titles(), ['GitHub', 'YouTube', 'Google'], '[→] 두 번 뒤 목록');
  // 맨 뒤로 가 [→]가 비활성이면 같은 카드의 다른 이동 버튼으로 포커스를 옮긴다.
  eq(app.doc.activeElement, cardButton(app, 'Google', 'move-prev'), '맨 뒤에서는 [←]로 포커스');
  app.click(cardButton(app, 'Google', 'move-prev'));
  eq(app.titles(), ['GitHub', 'Google', 'YouTube'], '[←] 뒤 목록');
  eq(stored().map(bm => bm.title), ['GitHub', 'Google', 'YouTube'], '저장된 순서');
});

test('5', '드래그로 이동한다 (대상 카드의 자리로)', async t => {
  const app = await t.open();
  drag(app, 'YouTube', 'Google');
  eq(app.titles(), ['YouTube', 'Google', 'GitHub'], '앞으로 드래그');
  drag(app, 'YouTube', 'GitHub');
  eq(app.titles(), ['Google', 'GitHub', 'YouTube'], '뒤로 드래그');
  eq(app.$$('.card.dragging, .card.drag-over').length, 0, '드래그 표시가 남지 않음');
});

test('5', '바꾼 순서는 다시 열어도 유지된다', async t => {
  const app = await t.open();
  app.click(cardButton(app, 'Google', 'move-next'));
  drag(app, 'YouTube', 'GitHub');
  const order = app.titles();
  await app.reload();
  eq(app.titles(), order, '다시 연 뒤 목록');
  eq(app.cardTitles(), order, '다시 연 뒤 화면');
});

test('5', '필터 중 이동은 보이는 이웃 카드의 자리로 간다 (D-016)', async t => {
  setStored([
    { id: 1, title: 'A', url: 'https://a.example', category: '개발', addedAt: null },
    { id: 2, title: 'B', url: 'https://b.example', category: '기타', addedAt: null },
    { id: 3, title: 'C', url: 'https://c.example', category: '개발', addedAt: null }
  ]);
  const app = await t.open();
  selectCategory(app, '개발');
  eq(app.cardTitles(), ['A', 'C'], '필터한 화면');
  app.click(cardButton(app, 'A', 'move-next'));
  eq(app.titles(), ['B', 'C', 'A'], '전체 목록');
  eq(app.cardTitles(), ['C', 'A'], '필터한 화면');
});

/* ---------- 6. 테마 ---------- */
test('6', '열 때는 OS 설정을 따르고 저장하지 않는다 (K-08)', async t => {
  const app = await t.open();
  const osTheme = app.win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  eq(app.doc.documentElement.getAttribute('data-theme'), osTheme, 'data-theme');
  eq(localStorage.getItem(app.state.keys.THEME_KEY), null, '저장된 테마');
});

test('6', '전환하면 저장되고 다시 열어도 유지된다', async t => {
  const app = await t.open();
  const before = app.doc.documentElement.getAttribute('data-theme');
  const after = before === 'dark' ? 'light' : 'dark';
  app.click('#themeToggleBtn');
  eq(app.doc.documentElement.getAttribute('data-theme'), after, '전환 뒤 data-theme');
  eq(localStorage.getItem(app.state.keys.THEME_KEY), after, '저장된 테마');
  eq(app.$('#themeToggleBtn').textContent, after === 'dark' ? '☀️' : '🌙', '버튼 아이콘');
  await app.reload();
  eq(app.doc.documentElement.getAttribute('data-theme'), after, '다시 연 뒤 data-theme');
});

/* ---------- 7. HTML 내보내기 ---------- */
const EXPORT_ITEMS = [
  { id: 1, title: '깃<허브> & "따옴표"', url: 'https://github.com/?a=1&b="2"', category: '개발', addedAt: 1700000000000 },
  { id: 2, title: '카테고리 없음', url: 'https://none.example/', category: '', addedAt: null },
  { id: 3, title: 'MDN', url: 'https://developer.mozilla.org/', category: '개발', addedAt: 1700000500000 },
  { id: 4, title: '이름이 같은 폴더', url: 'https://other.example/', category: '기타 북마크', addedAt: 1700000900000 }
];

test('7', '내보낸 HTML: 형식 머리말·앱 표시, 카테고리 = 폴더, ADD_DATE = 추가 시각, 이스케이프 (D-009)', async t => {
  setStored(EXPORT_ITEMS);
  const app = await t.open();
  app.click('[onclick="exportHTML()"]');
  eq(app.downloads.length, 1, '다운로드 수');
  const { content, type, filename } = app.downloads[0];
  ok(/^bookmarks_\d{4}-\d{2}-\d{2}\.html$/.test(filename), `파일 이름 (${filename})`);
  eq(type, 'text/html;charset=utf-8', '형식');
  ok(content.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'), '머리말');
  const doc = new DOMParser().parseFromString(content, 'text/html');
  eq(doc.querySelector('meta[name="generator"]')?.getAttribute('content'), 'jdrbmmanager', '앱 표시');
  const folders = [...doc.querySelectorAll('h3')].map(h3 => ({
    name: h3.textContent,
    links: [...h3.parentElement.querySelector(':scope > dl').querySelectorAll('a')]
      .map(a => [a.textContent, a.getAttribute('href'), a.getAttribute('add_date')])
  }));
  eq(folders, [
    { name: '개발', links: [[EXPORT_ITEMS[0].title, EXPORT_ITEMS[0].url, '1700000000'], ['MDN', 'https://developer.mozilla.org/', '1700000500']] },
    { name: '기본 북마크', links: [['카테고리 없음', 'https://none.example/', null]] },
    { name: '기타 북마크', links: [['이름이 같은 폴더', 'https://other.example/', '1700000900']] }
  ], '폴더와 북마크');
});

/* ---------- 8. JSON 백업·복구 ---------- */
const RESTORE_FILE = JSON.stringify([{ id: 100, title: '복구1', url: 'https://r1.example', category: '복구', addedAt: 1700000000000 }]);

test('8', 'JSON 백업 내용은 지금 목록 그대로', async t => {
  const app = await t.open();
  app.click('[onclick="exportJSON()"]');
  const { content, type, filename } = app.downloads[0];
  ok(/^bookmarks_backup_\d{4}-\d{2}-\d{2}\.json$/.test(filename), `파일 이름 (${filename})`);
  eq(type, 'application/json', '형식');
  eq(JSON.parse(content), app.state.bookmarks, '내용');
});

test('8', '복구 [확인]은 전체 덮어쓰기', async t => {
  const app = await t.open();
  app.answerConfirm(true);
  await app.importFile('backup.json', RESTORE_FILE);
  eq(app.titles(), ['복구1'], '목록');
  eq(stored(), JSON.parse(RESTORE_FILE), '저장된 목록');
  eq(lastDialog(app), { type: 'alert', message: '북마크 1개를 불러왔습니다.' }, '알림');
});

test('8', '복구 [취소]는 기존 목록 앞에 병합', async t => {
  const app = await t.open();
  app.answerConfirm(false);
  await app.importFile('backup.json', RESTORE_FILE);
  eq(app.titles(), ['복구1', ...SEED_TITLES], '목록');
  eq(stored().map(bm => bm.title), ['복구1', ...SEED_TITLES], '저장된 목록');
});

test('8', '같은 파일을 두 번 병합한 뒤 하나를 지워도 하나만 사라진다 (K-05)', async t => {
  const app = await t.open();
  // 시드의 ID 1과도 겹친다.
  const file = JSON.stringify([{ id: 1, title: '중복', url: 'https://dup.example' }]);
  app.answerConfirm(false);
  await app.importFile('backup.json', file);
  app.answerConfirm(false);
  await app.importFile('backup.json', file);
  eq(app.titles(), ['중복', '중복', ...SEED_TITLES], '두 번 병합한 목록');
  const ids = app.state.bookmarks.map(bm => bm.id);
  eq(new Set(ids).size, ids.length, 'ID가 모두 다름');
  app.answerConfirm(true);
  app.click(app.$$('.card [data-action="delete"]')[0]);
  eq(app.titles(), ['중복', ...SEED_TITLES], '하나 지운 뒤 목록');
});

test('8', '문자열 ID·없는 ID·겹치는 ID는 겹치지 않는 숫자로 정규화된다 (D-014)', async t => {
  const app = await t.open();
  app.answerConfirm(true);
  await app.importFile('backup.json', JSON.stringify([
    { id: '7', title: 'a', url: 'https://a.example' },
    { title: 'b', url: 'https://b.example' },
    { id: 7, title: 'c', url: 'https://c.example' }
  ]));
  const ids = app.state.bookmarks.map(bm => bm.id);
  eq(ids[0], 7, '문자열 "7" → 7');
  ok(ids.every(id => Number.isSafeInteger(id) && id > 0), `모두 양의 정수 (${ids})`);
  eq(new Set(ids).size, 3, 'ID가 모두 다름');
  // 정규화한 ID로 수정·삭제가 동작한다 (K-06)
  app.answerConfirm(true);
  app.click(cardButton(app, 'c', 'delete'));
  eq(app.titles(), ['a', 'b'], '삭제 뒤 목록');
});

/* ---------- 9. 잘못된 파일 ---------- */
test('9', '잘못된 파일은 알림 뒤 목록을 바꾸지 않고, 앱은 계속 동작한다', async t => {
  const app = await t.open();
  const cases = [
    ['배열 아닌 JSON', 'object.json', '{"a":1}', '올바른 JSON 데이터 형식이 아닙니다.'],
    ['텍스트 파일', 'notes.txt', '그냥 글', '파일을 읽는 도중 오류가 발생했습니다.'],
    ['빈 HTML 파일', 'empty.html', '', '가져올 북마크가 없습니다.\n(브라우저에서 내보낸 북마크 HTML 파일인지 확인해 주세요.)'],
    ['북마크 없는 HTML', 'nolinks.html', '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n</DL><p>', '가져올 북마크가 없습니다.\n(브라우저에서 내보낸 북마크 HTML 파일인지 확인해 주세요.)'],
    ['javascript: 주소만 있는 JSON', 'bad.json', '[{"title":"x","url":"javascript:alert(1)"},{"title":"y","url":"data:text/html,hi"}]', '불러올 수 있는 북마크가 없습니다.\n(제목과 http/https 주소가 있는 항목만 불러옵니다.)']
  ];
  for (const [label, name, text, message] of cases) {
    await app.importFile(name, text);
    eq(lastDialog(app), { type: 'alert', message }, `${label}: 알림`);
    eq(app.titles(), SEED_TITLES, `${label}: 목록`);
  }
  eq(localStorage.getItem(STORAGE_KEY), null, '저장 안 됨');
  addViaModal(app, { title: '그 뒤 추가', url: 'after.example' });
  eq(app.titles()[0], '그 뒤 추가', '이어서 추가');
});

test('9', '형식이 잘못된 항목만 건너뛰고 그 개수를 알린다 (D-014)', async t => {
  const app = await t.open();
  app.answerConfirm(false);
  await app.importFile('mixed.json', JSON.stringify([
    { title: '좋음', url: 'https://ok.example' },
    { title: '스크립트', url: 'javascript:alert(1)' },
    { title: '', url: 'https://notitle.example' },
    { title: '긴 주소', url: 'https://long.example/' + 'a'.repeat(2048) },
    'not an object'
  ]));
  eq(app.titles(), ['좋음', ...SEED_TITLES], '목록');
  eq(lastDialog(app), { type: 'alert', message: '북마크 1개를 불러왔습니다.\n형식이 잘못된 4개 항목은 건너뛰었습니다.' }, '알림');
});

/* ---------- 10. 브라우저 북마크 가져오기 ---------- */
// 크롬이 내보내는 형식. 최상위 폴더(북마크바, 기타 북마크), 중첩 폴더, 엔티티, javascript: 주소, 이미 있는 주소, 빈 제목.
const CHROME_BOOKMARKS = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000" PERSONAL_TOOLBAR_FOLDER="true">북마크바</H3>
    <DL><p>
        <DT><A HREF="https://news.example/" ADD_DATE="1700000100" ICON="data:image/png;base64,AAAA">뉴스 &amp; 날씨</A>
        <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">개발</H3>
        <DL><p>
            <DT><A HREF="https://developer.mozilla.org/ko/" ADD_DATE="1700000200">MDN</A>
            <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">JS</H3>
            <DL><p>
                <DT><A HREF="https://javascript.info/" ADD_DATE="1700000300">JS 튜토리얼</A>
            </DL><p>
        </DL><p>
        <DT><A HREF="javascript:alert(1)" ADD_DATE="1700000400">북마클릿</A>
        <DT><A HREF="https://GITHUB.com" ADD_DATE="1700000500">GitHub 중복</A>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">기타 북마크</H3>
    <DL><p>
        <DT><A HREF="https://empty-title.example/path" ADD_DATE="1700000600"></A>
    </DL><p>
</DL><p>
`;

test('10', '크롬 북마크: 개수를 확인한 뒤 맨 앞에 추가. 가장 안쪽 폴더 = 카테고리, 최상위 폴더 제외, ADD_DATE = 추가 시각 (D-024)', async t => {
  const app = await t.open();
  app.answerConfirm(true);
  await app.importFile('bookmarks_chrome.html', CHROME_BOOKMARKS);
  eq(app.dialogs, [
    { type: 'confirm', message: '북마크 4개를 가져올까요?\n(이미 있는 주소 1개, 가져올 수 없는 항목 1개는 건너뜁니다.)' },
    { type: 'alert', message: '북마크 4개를 가져왔습니다.' }
  ], '대화상자');
  eq(app.state.bookmarks.slice(0, 4).map(({ title, url, category, addedAt }) => ({ title, url, category, addedAt })), [
    { title: '뉴스 & 날씨', url: 'https://news.example/', category: '', addedAt: 1700000100000 },
    { title: 'MDN', url: 'https://developer.mozilla.org/ko/', category: '개발', addedAt: 1700000200000 },
    { title: 'JS 튜토리얼', url: 'https://javascript.info/', category: 'JS', addedAt: 1700000300000 },
    { title: 'empty-title.example', url: 'https://empty-title.example/path', category: '', addedAt: 1700000600000 }
  ], '가져온 항목');
  eq(app.titles().slice(4), SEED_TITLES, '기존 목록은 뒤에');
  eq(stored().length, 7, '저장된 개수');
});

test('10', '같은 파일을 다시 가져오면 "새로 가져올 북마크가 없습니다"', async t => {
  const app = await t.open();
  app.answerConfirm(true);
  await app.importFile('bookmarks_chrome.html', CHROME_BOOKMARKS);
  await app.importFile('bookmarks_chrome.html', CHROME_BOOKMARKS);
  eq(lastDialog(app), { type: 'alert', message: '새로 가져올 북마크가 없습니다.\n(이미 있는 주소 5개, 가져올 수 없는 항목 1개)' }, '알림');
  eq(app.state.bookmarks.length, 7, '개수 그대로');
});

test('10', '확인 창에서 취소하면 가져오지 않는다', async t => {
  const app = await t.open();
  await app.importFile('bookmarks_chrome.html', CHROME_BOOKMARKS);
  eq(app.dialogs.map(d => d.type), ['confirm'], '확인 창만');
  eq(app.titles(), SEED_TITLES, '목록');
});

test('10', '7에서 내보낸 파일을 빈 목록에 가져오면 카테고리(기타 북마크 포함)와 추가 시각이 돌아온다', async t => {
  setStored(EXPORT_ITEMS);
  const app = await t.open();
  app.click('[onclick="exportHTML()"]');
  const exported = app.downloads[0].content;
  setStored([]);
  await app.reload();
  eq(app.titles(), [], '빈 목록');
  app.answerConfirm(true);
  await app.importFile('bookmarks_2026-10-22.html', exported);
  const pick = list => list.map(({ title, url, category, addedAt }) => ({ title, url, category, addedAt }))
    .sort((a, b) => a.title.localeCompare(b.title));
  eq(pick(app.state.bookmarks), pick(EXPORT_ITEMS), '돌아온 항목');
});

/* ---------- 11. 마이그레이션 ---------- */
test('11', 'v2 키에만 데이터가 있으면 같은 목록이 보이고 v3 키가 생기며 v2 키는 남는다 (D-015)', async t => {
  const legacy = [{ id: 1700000000000, title: '옛 항목', url: 'https://old.example', category: '옛' }];
  setStored(legacy, 'single_file_bookmarks_v2');
  const app = await t.open();
  eq(app.titles(), ['옛 항목'], '목록');
  eq(app.state.bookmarks[0].addedAt, 1700000000000, 'ID로 추정한 추가 시각');
  eq(stored(), app.state.bookmarks, 'v3 키');
  eq(localStorage.getItem('single_file_bookmarks_v2'), JSON.stringify(legacy), 'v2 키 그대로');
});

/* ---------- 점검: 체크리스트 ---------- */
test('점검', 'XSS: 제목·주소·카테고리의 따옴표·태그가 속성을 끊거나 실행되지 않는다', async t => {
  const item = {
    id: 1,
    title: '"><img src=x onerror="window.__xss=1">',
    url: 'https://x.example/?q="><img src=x onerror=window.__xss=1>\'',
    category: '<b onmouseover="window.__xss=1">c</b>',
    addedAt: null
  };
  setStored([item]);
  const app = await t.open();
  // 깨진 속성으로 생긴 img가 있으면 onerror가 실행될 시간을 준다.
  await new Promise(resolve => setTimeout(resolve, 100));
  const card = app.$('.card');
  eq(card.querySelectorAll('img').length, 1, '카드의 img는 파비콘 하나');
  eq(card.querySelectorAll('b, [onmouseover]').length, 0, '주입된 요소');
  eq(card.querySelector('.card-title').getAttribute('href'), item.url, 'href 값');
  eq(card.querySelector('.card-title').textContent, item.title, '제목 글자');
  eq(card.querySelector('.badge').textContent, item.category, '카테고리 글자');
  eq(app.win.__xss, undefined, '스크립트 실행');
});

// 카테고리 이름이 길면 필터 선택 상자가 그 폭으로 넓어지는 문제는 K-24(미해결)라 여기서는 짧은 카테고리만 쓴다.
test('점검', '360px 폭에서 가로 스크롤이 없다 (긴 제목·주소, 모달)', async t => {
  setStored([
    { id: 1, title: '아주 긴 제목'.repeat(20), url: 'https://very-long.example/' + 'a'.repeat(300), category: '긴 이름', addedAt: null },
    { id: 2, title: 'GitHub', url: 'https://github.com', category: '개발', addedAt: null }
  ]);
  const app = await t.open({ width: 360 });
  const root = app.doc.documentElement;
  ok(root.scrollWidth <= root.clientWidth, `목록 화면 scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth}`);
  app.click('[onclick="openModal()"]');
  ok(root.scrollWidth <= root.clientWidth, `모달 scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth}`);
});

/* ---------- 변이 점검 (3.8): 앱 원문에 알려진 결함을 하나씩 넣는다. 하나 이상의 시험이 실패해야 한다 ---------- */
const MUTANTS = [];
