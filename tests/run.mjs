/* 자동 회귀 시험 러너 (DECISIONS.md D-027). Node 내장 모듈만 쓴다.
   저장소를 시험 전용 포트에 서비스하고, 임시 프로필로 헤드리스 크롬(없으면 엣지)을 띄워 tests/run.html을 연 뒤,
   페이지가 POST /__result로 보낸 결과를 출력하고 브라우저·서버·임시 프로필을 정리한다.

   node tests/run.mjs            전체 자동 시험
   node tests/run.mjs --mutants  변이 점검 (시험이 알려진 결함을 잡는지)
   node tests/run.mjs --serve    서버만 띄움. 보통 브라우저로 http://127.0.0.1:8766/tests/run.html 을 연다 (Ctrl+C로 끝)

   종료 코드: 모두 통과 0, 실패 1, 하네스·브라우저·포트 오류 2 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// run.html의 TEST_PORT와 같아야 한다. 앱 출처(수동 시험 포트, GitHub Pages)와 다른 출처를 쓰려고 고정한다.
const PORT = 8766;
const HOST = '127.0.0.1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const PROFILE_PREFIX = 'jdrbm-test-';
const args = new Set(process.argv.slice(2));
const MODE = args.has('--serve') ? 'serve' : args.has('--mutants') ? 'mutants' : 'run';
// 변이 점검은 변이마다 시험을 다시 돌리므로 더 기다린다.
const RESULT_TIMEOUT_MS = MODE === 'mutants' ? 300000 : 60000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.rules': 'text/plain; charset=utf-8'
};

let resolveResult;
const resultReceived = new Promise(resolve => { resolveResult = resolve; });

function serveFile(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // NUL이 든 경로는 fs가 예외를 던져 서버가 죽는다.
  if (pathname.includes('\0')) {
    res.writeHead(400).end();
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  // 저장소 폴더 밖과 .git은 내주지 않는다. 윈도우는 대소문자와 이름 끝의 점·공백을 무시하므로(.GIT, .git.) 맞춰 비교한다.
  const file = path.resolve(ROOT, '.' + pathname);
  const relative = path.relative(ROOT, file);
  const isGitPath = relative.toLowerCase().split(path.sep).some(part => part.replace(/[. ]+$/, '') === '.git');
  if (relative.startsWith('..') || path.isAbsolute(relative) || isGitPath) {
    res.writeHead(404).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function receiveResult(req, res) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) req.destroy();
  });
  req.on('end', () => {
    res.writeHead(204).end();
    try {
      resolveResult(JSON.parse(body));
    } catch {
      resolveResult({ harnessError: '결과를 읽지 못했습니다 (JSON 아님).' });
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__result') receiveResult(req, res);
  else if (req.method === 'GET' || req.method === 'HEAD') serveFile(req, res);
  else res.writeHead(405).end();
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });
}

function findBrowser() {
  const env = process.env;
  const windowsRoots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
  const candidates = [
    env.BROWSER_PATH,
    ...windowsRoots.map(root => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...windowsRoots.map(root => path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ];
  return candidates.find(file => file && fs.existsSync(file)) || null;
}

function launchBrowser(browser, profile, url) {
  return spawn(browser, [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    url
  ], { stdio: 'ignore' });
}

// 엣지는 띄운 프로세스가 곧바로 끝나고 다른 프로세스가 페이지를 연다. 그래서 주 프로세스 트리뿐 아니라
// 이 실행의 임시 프로필을 쓰는 프로세스를 모두 끝낸다 (남으면 프로필을 지울 수 없고 서버 연결도 남는다).
function killBrowser(child, profile) {
  if (process.platform === 'win32') {
    if (child.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    const literal = profile.replace(/'/g, "''");
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `$ids = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${literal}') -and $_.ProcessId -ne $PID } | ForEach-Object { $_.ProcessId }); ` +
      `$ids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; ` +
      `$ids | ForEach-Object { Wait-Process -Id $_ -Timeout 5 -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' });
  } else {
    if (child.exitCode === null) child.kill('SIGKILL');
    spawnSync('pkill', ['-KILL', '-f', profile], { stdio: 'ignore' });
  }
}

function removeProfile(profile) {
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // 남은 임시 폴더는 OS가 정리한다.
  }
}

function browserLabel(userAgent = '') {
  const edge = userAgent.match(/Edg\/(\d+)/);
  if (edge) return `엣지 ${edge[1]}`;
  const chrome = userAgent.match(/Chrome\/(\d+)/);
  return chrome ? `크롬 ${chrome[1]}` : '브라우저';
}

function printRunResult(result) {
  const seconds = (result.durationMs / 1000).toFixed(1);
  console.log(`자동 시험: 통과 ${result.passed}/전체 ${result.total} (${browserLabel(result.userAgent)}, ${seconds}초)`);
  if (result.failures.length) {
    console.log('실패:');
    result.failures.forEach(f => console.log(`  [${f.group}] ${f.name} — ${f.message}`));
  }
  console.log(`수동으로 남은 번호: ${result.manual}`);
  return result.failures.length ? 1 : 0;
}

function printMutantResult(result) {
  const seconds = (result.durationMs / 1000).toFixed(1);
  if (result.baseFailures.length) {
    console.log('변이 점검: 원본에서 실패한 시험이 있어 변이를 돌리지 않았습니다. 먼저 node tests/run.mjs로 고치세요.');
    result.baseFailures.forEach(f => console.log(`  [${f.group}] ${f.name} — ${f.message}`));
    return 1;
  }
  const killed = result.mutants.filter(m => m.status === 'killed').length;
  console.log(`변이 점검: 잡음 ${killed}/전체 ${result.mutants.length} (${browserLabel(result.userAgent)}, ${seconds}초)`);
  result.mutants.forEach(m => {
    const detail = m.status === 'killed' ? `잡음 — [${m.caughtBy.group}] ${m.caughtBy.name}`
      : m.status === 'survived' ? '살아남음 — 이 결함을 잡는 시험이 없습니다'
      : `대상 없음 — ${m.message}`;
    console.log(`  ${m.status === 'killed' ? '✓' : '✗'} ${m.name}: ${detail}`);
  });
  return killed === result.mutants.length ? 0 : 1;
}

async function main() {
  try {
    await listen();
  } catch (err) {
    console.error(err.code === 'EADDRINUSE'
      ? `포트 ${PORT}을(를) 이미 쓰고 있습니다. 다른 시험이나 서버를 끄고 다시 실행하세요.`
      : `서버를 시작하지 못했습니다: ${err.message}`);
    return 2;
  }

  if (MODE === 'serve') {
    console.log(`시험 서버: http://${HOST}:${PORT}/tests/run.html (Ctrl+C로 끝)`);
    return new Promise(() => {});
  }

  const browser = findBrowser();
  if (!browser) {
    console.error('크롬이나 엣지를 찾지 못했습니다. 환경 변수 BROWSER_PATH에 브라우저 실행 파일 경로를 넣어 주세요.');
    server.close();
    return 2;
  }

  // 지난 실행에서 지우지 못한 임시 프로필. 포트를 잡았으므로 다른 실행이 쓰는 중이 아니다.
  fs.readdirSync(os.tmpdir()).filter(name => name.startsWith(PROFILE_PREFIX))
    .forEach(name => removeProfile(path.join(os.tmpdir(), name)));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
  const url = `http://${HOST}:${PORT}/tests/run.html?report${MODE === 'mutants' ? '&mutants' : ''}`;
  const child = launchBrowser(browser, profile, url);
  // 띄운 프로세스가 끝나는 것은 실패가 아니다(엣지는 곧바로 끝남). 결과가 오지 않으면 시간 제한으로 끝낸다.
  const spawnFailed = new Promise(resolve => child.once('error', err => resolve({ harnessError: `브라우저를 실행하지 못했습니다: ${err.message}` })));
  const timedOut = new Promise(resolve => setTimeout(() => resolve({ harnessError: `${RESULT_TIMEOUT_MS / 1000}초 안에 시험이 끝나지 않았습니다.` }), RESULT_TIMEOUT_MS).unref());

  const result = await Promise.race([resultReceived, spawnFailed, timedOut]);
  killBrowser(child, profile);
  server.close();
  server.closeAllConnections();
  removeProfile(profile);

  if (result.harnessError) {
    console.error(`시험 오류: ${result.harnessError}`);
    return 2;
  }
  return MODE === 'mutants' ? printMutantResult(result) : printRunResult(result);
}

process.exitCode = await main();
