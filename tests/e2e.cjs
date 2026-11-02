/**
 * E2E 검증: 두 브라우저로 동시 접속해 동기화·권한·개인정보 원칙을 확인한다.
 * 실행: npm test   (Playwright + Chromium 필요)
 */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = 3200 + Math.floor(Math.random() * 500);
const URL = `http://localhost:${PORT}`;
const HOST_KEY = 'e2e-key';
const SECRET_MEMO = '비밀메모-절대전송금지-7731';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const check = (name, cond) => { assert.ok(cond, name); passed++; console.log(`  ✔ ${name}`); };

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), MASS_HOST_KEY: HOST_KEY }, stdio: 'pipe',
  });
  await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('http://') && res()));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  try {
    const open = async (name) => {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 } });
      const page = await ctx.newPage();
      const sent = [];
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(String(f.payload))));
      await page.goto(URL);
      await page.fill('#nick', name);
      await page.click('#join-form button');
      await page.waitForFunction(() => window.__cathedral?.massUI.state);
      return { page, sent, errors };
    };

    console.log('1) 접속·위치 동기화');
    const A = await open('요셉');
    const B = await open('마리아');
    await wait(500);
    check('B 화면에 접속자 2명 표시', (await B.page.textContent('#count')) === '2');
    await A.page.evaluate(() => window.__cathedral.controls.pos.set(-9, 0, 0));
    await wait(800);
    const seen = await B.page.evaluate(() => [...window.__cathedral.avatars.items.values()][0].target.x);
    check('A의 이동이 B에 반영', Math.abs(seen - -9) < 0.1);

    console.log('2) 미사 진행 권한');
    await B.page.evaluate(() => window.__cathedral.net.send({ t: 'mass', action: 'next' }));
    await wait(300);
    check('진행자 아닌 사용자의 단계 조작 거부', (await B.page.evaluate(() => window.__cathedral.massUI.state.stepIndex)) === -1);
    await A.page.click('#btn-host');
    await A.page.fill('#host-key', HOST_KEY);
    await A.page.click('#host-form button[value=ok]');
    await A.page.waitForSelector('#host-controls:not([hidden])');
    await A.page.click('#host-controls [data-act=next]');
    await A.page.click('#host-controls [data-act=next]');
    await wait(400);
    check('B HUD가 2단계(성호경과 인사)로 동기화', (await B.page.textContent('#mass-title')) === '성호경과 인사');

    console.log('3) 응답 버튼');
    await B.page.click('#mass-responses button:nth-child(2)');
    await wait(400);
    const bubble = await A.page.evaluate(() => !![...window.__cathedral.avatars.items.values()][0].bubble);
    check('B의 응답이 A 화면에 말풍선으로 표시', bubble);

    console.log('4) 채팅 XSS 방어');
    await B.page.fill('#chat-input', '<img src=x onerror=alert(1)>');
    await B.page.press('#chat-input', 'Enter');
    await wait(400);
    check('채팅에 HTML 태그가 생성되지 않음', (await A.page.locator('#chat-log img').count()) === 0);
    check('채팅 문자열은 텍스트로 표시', (await A.page.textContent('#chat-log')).includes('<img src=x'));

    console.log('5) 침묵 모드');
    await A.page.click('#btn-silence');
    await wait(300);
    check('침묵 모드에서 일반 사용자 입력 비활성화', await B.page.isDisabled('#chat-input'));
    await A.page.click('#btn-silence');

    console.log('6) 고해소 점유·개인정보');
    for (const P of [A, B]) await P.page.evaluate(() => { const c = window.__cathedral.controls; c.pos.set(-9.5, 0, 14); });
    await A.page.keyboard.press('KeyE');
    await A.page.waitForSelector('#confession:not([hidden])');
    await wait(300);
    await B.page.keyboard.press('KeyE');
    await wait(400);
    check('고해소 1인 점유(B 진입 차단)', await B.page.isHidden('#confession'));
    await A.page.click('#conf-next');
    await A.page.fill('#conf-body textarea', SECRET_MEMO);
    await A.page.click('#conf-body input[type=checkbox]');
    await A.page.click('#conf-next');
    await A.page.click('#conf-prev');
    check('단계 이동 중 메모 유지', (await A.page.inputValue('#conf-body textarea')) === SECRET_MEMO);
    const storage = await A.page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
    check('메모가 브라우저 저장소에 없음', !storage.includes(SECRET_MEMO));
    await A.page.click('#conf-close');
    await wait(300);
    check('나간 뒤 메모 DOM 삭제', !(await A.page.content()).includes(SECRET_MEMO));
    check('WebSocket 송신 프레임에 메모 없음', !A.sent.some((f) => f.includes(SECRET_MEMO)));
    await wait(300);
    await B.page.keyboard.press('KeyE');
    await B.page.waitForSelector('#confession:not([hidden])');
    check('A 퇴장 후 B 입장 가능', true);
    await B.page.click('#conf-close');

    console.log('7) 퇴장 처리');
    await B.page.context().close();
    await wait(500);
    check('B 퇴장 시 A 화면 인원 1명', (await A.page.textContent('#count')) === '1');
    check('페이지 런타임 오류 없음', A.errors.length === 0 && B.errors.length === 0);

    console.log(`\n✅ ${passed}개 검사 통과`);
  } catch (e) {
    console.error('\n❌ 실패:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})();
