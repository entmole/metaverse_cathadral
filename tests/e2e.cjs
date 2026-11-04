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
      await page.waitForSelector('#nick', { timeout: 60000 });
      await page.fill('#nick', name);
      await page.click('#join-form button');
      await page.waitForFunction(() => window.__cathedral?.massUI.state);
      // 첫 입장 조작 안내 창 닫기
      await page.click('#help-dialog .help-foot button');
      return { page, sent, errors };
    };

    console.log('1) 접속·위치 동기화');
    const A = await open('요셉');
    const B = await open('마리아');
    await wait(500);
    check('B 화면에 접속자 2명 표시', (await B.page.textContent('#count')) === '2');
    await A.page.evaluate(() => window.__cathedral.controls.pos.set(-9, 0, 0));
    await B.page.waitForFunction(() => Math.abs([...window.__cathedral.avatars.items.values()][0].target.x + 9) < 0.1, null, { timeout: 5000 }).catch(() => {});
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

    console.log('2-1) 배경음');
    const au = () => B.page.evaluate(() => window.__cathedral.audioState());
    let st = await au();
    check(`입장 후 오디오 재생 상태 (${st.ctx})`, st.ctx === 'running' && st.ambientPlaying);
    check(`미사 단계(인사)에 맞춰 오르간 '잔잔하게' (${st.level})`, st.level === 'soft');
    check(`기본 음량 80% (${st.prefs.volume})`, st.prefs.volume === 0.8 && (await B.page.textContent('#snd-volume-out')) === '80%');
    await A.page.click('#host-controls [data-act=next]');
    await A.page.click('#host-controls [data-act=next]');
    await wait(400);
    check(`침묵 단계(참회 다음 대영광송) 오르간 연주 (${(await au()).level})`, (await au()).level === 'organ');
    await A.page.click('#host-controls [data-act=prev]');
    await wait(400);
    check(`참회 예식은 오르간 멈춤 (${(await au()).level})`, (await au()).level === 'silent');
    await B.page.click('#btn-sound');
    check('🔊 버튼으로 소리 설정 열기', await B.page.isVisible('#sound-panel'));
    await B.page.uncheck('#snd-ambient');
    st = await au();
    check('배경음 끄기', !st.ambientPlaying && st.prefs.ambient === false);
    await B.page.fill('#snd-volume', '30');
    check('음량 조절 30%', (await au()).prefs.volume === 0.3 && (await B.page.textContent('#snd-volume-out')) === '30%');
    await B.page.check('#snd-ambient');
    check('배경음 다시 켜기', (await au()).ambientPlaying);
    await B.page.click('#topbar .presence'); // 3D 화면을 누르면 마우스가 잠기므로 HUD 빈 곳을 누름
    check('바깥을 누르면 소리 설정 닫힘', await B.page.isHidden('#sound-panel'));
    // 이후 검사를 위해 2단계(성호경과 인사)로 복귀
    await A.page.click('#host-controls [data-act=prev]');
    await wait(300);

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

    console.log('6-1) 인사·평화의 인사');
    const place = (P, x, z, yaw) => P.page.evaluate(([x, z, yaw]) => { const c = window.__cathedral.controls; c.pos.set(x, 0, z); c.yaw = yaw; c.pitch = 0; }, [x, z, yaw]);
    const otherOf = (P) => P.page.evaluate(() => [...window.__cathedral.avatars.items.values()][0]?.gesture ?? null);
    await place(A, 0, 12, 0);
    await place(B, 0, 10, Math.PI);
    await A.page.waitForFunction(() => Math.abs([...window.__cathedral.avatars.items.values()][0].g.position.z - 10) < 0.05, null, { timeout: 15000 });
    const vp = A.page.viewportSize();
    check('A가 화면 속 B 아바타를 눌러 인사 카드 열기', await A.page.evaluate(([x, y]) => window.__cathedral.greet.pickAt({ x, y }), [vp.width / 2, vp.height / 2 - 10]));
    check('인사 카드에 B 이름 표시', (await A.page.textContent('#ac-name')) === '마리아');
    await A.page.click('#ac-bow');
    await B.page.waitForSelector('#greet-notice:not([hidden])', { timeout: 5000 });
    check('B에게 인사 알림', (await B.page.textContent('#gn-text')).includes('요셉 님이 인사했습니다'));
    check('B 화면에서 A가 고개 숙임', (await otherOf(B)) === 'bow');
    await B.page.click('#gn-reply');
    await A.page.waitForSelector('#greet-notice:not([hidden])', { timeout: 5000 });
    check('B의 답례가 A에게 도착', (await A.page.textContent('#gn-text')).includes('마리아 님이 답례했습니다'));
    check('답례에는 다시 답례 버튼 없음(무한 반복 방지)', await A.page.isHidden('#gn-reply'));

    await wait(1700); // 서버 연속 인사 제한(1.5초)
    await place(B, 0, 25, Math.PI);
    await A.page.waitForFunction(() => Math.abs([...window.__cathedral.avatars.items.values()][0].target.z - 25) < 0.1, null, { timeout: 15000 });
    await A.page.evaluate(() => window.__cathedral.greet.openCard([...window.__cathedral.avatars.items.keys()][0]));
    check('멀리 있는 사람은 인사 버튼 비활성화', await A.page.isDisabled('#ac-bow'));
    await A.page.click('#ac-close');
    const bId = await A.page.evaluate(() => [...window.__cathedral.avatars.items.keys()][0]);
    const selfIdA = await B.page.evaluate(() => [...window.__cathedral.avatars.items.keys()][0]);
    await B.page.evaluate(() => document.querySelector('#greet-notice').hidden = true);
    await A.page.evaluate((to) => {
      const n = window.__cathedral.net;
      n.send({ t: 'gesture', kind: 'bow', to });          // 거리 초과
      n.send({ t: 'gesture', kind: 'dance', to });        // 없는 동작
    }, bId);
    await wait(800);
    check('서버가 거리 초과 인사를 거부', await B.page.isHidden('#greet-notice'));
    await wait(1700);
    await A.page.evaluate((me) => window.__cathedral.net.send({ t: 'gesture', kind: 'bow', to: me }), selfIdA);
    await A.page.evaluate(() => window.__cathedral.net.send({ t: 'gesture', kind: 'bow' })); // 대상 없는 개별 인사
    await wait(800);
    check('자기 자신·대상 없는 개별 인사 거부', (await otherOf(B)) === null);

    await place(B, 0, 10, Math.PI);
    await wait(1700);
    await B.page.keyboard.press('KeyF');
    await A.page.waitForFunction(() => [...window.__cathedral.avatars.items.values()][0].gesture === 'peace', null, { timeout: 5000 }).catch(() => {});
    check('F키 평화의 인사가 A 화면에 보임', (await otherOf(A)) === 'peace');
    // 진행자가 '평화의 인사' 단계로 이동 → 패널에 버튼 표시
    await A.page.evaluate(async () => {
      const ui = window.__cathedral.massUI;
      while (ui.order.steps[ui.state.stepIndex]?.id !== 'peace') {
        window.__cathedral.net.send({ t: 'mass', action: 'next' });
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await B.page.waitForSelector('#btn-peace-step:not([hidden])', { timeout: 5000 }).catch(() => {});
    check('평화의 인사 단계에 🕊 버튼 표시', await B.page.isVisible('#btn-peace-step'));
    await wait(1700);
    await B.page.click('#btn-peace-step');
    await A.page.waitForFunction(() => [...window.__cathedral.avatars.items.values()][0].gesture === 'peace', null, { timeout: 5000 }).catch(() => {});
    check('🕊 버튼으로 평화의 인사', (await otherOf(A)) === 'peace');

    console.log('7) 스마트폰 조이스틱·조작 안내');
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const M = await mctx.newPage();
    const mErrors = [];
    M.on('pageerror', (e) => mErrors.push(e.message));
    await M.goto(URL);
    check('입장 화면에 스마트폰 조작 안내 표시', await M.isVisible('.keys.only-touch') && await M.isHidden('.keys.only-desktop'));
    await M.fill('#nick', '모니카');
    await M.tap('#join-form button');
    await M.waitForFunction(() => window.__cathedral?.massUI.state);
    check('첫 입장 시 조작 안내 자동 표시(스마트폰 탭)', await M.isVisible('#help-dialog [data-panel=touch]') && await M.isHidden('#help-dialog [data-panel=desktop]'));
    await M.tap('#help-dialog .help-foot button');
    check('두 조이스틱 표시', await M.isVisible('#stick-move') && await M.isVisible('#stick-look'));
    check('모바일은 미사 안내가 접힌 상태로 시작', await M.evaluate(() => document.querySelector('#mass-panel').classList.contains('collapsed')));

    // 스틱을 손가락으로 민 상태를 PointerEvent로 재현
    const drag = (sel, dx, dy, ms) => M.evaluate(async ([sel, dx, dy, ms]) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const opt = (x, y) => ({ pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true });
      el.dispatchEvent(new PointerEvent('pointerdown', opt(cx, cy)));
      el.dispatchEvent(new PointerEvent('pointermove', opt(cx + dx, cy + dy)));
      await new Promise((r) => setTimeout(r, ms));
      const c = window.__cathedral.controls;
      const held = { joy: { ...c.joy }, look: { ...c.lookJoy } }; // 누르고 있는 동안의 입력값
      el.dispatchEvent(new PointerEvent('pointerup', opt(cx + dx, cy + dy)));
      return held;
    }, [sel, dx, dy, ms]);

    await M.evaluate(() => { const c = window.__cathedral.controls; c.pos.set(0, 0, 20); c.yaw = 0; });
    // 테스트 환경은 소프트웨어 렌더링이라 초당 프레임이 낮음 → 입력값과 이동 방향으로 검증
    const mv = await drag('#stick-move', 0, -60, 2500);
    const z = await M.evaluate(() => window.__cathedral.controls.pos.z);
    check(`왼쪽 조이스틱 최대로 밀면 전진 입력 1.0 (y=${mv.joy.y.toFixed(2)})`, mv.joy.y <= -0.99);
    check(`전진 방향으로 실제 이동 (z 20 → ${z.toFixed(2)})`, z < 19.9);
    const lk = await drag('#stick-look', 60, 0, 2500);
    const yaw = await M.evaluate(() => window.__cathedral.controls.yaw);
    check(`오른쪽 조이스틱 오른쪽으로 밀면 시점 입력 (x=${lk.look.x.toFixed(2)})`, lk.look.x >= 0.99);
    check(`시선이 오른쪽으로 회전 (yaw ${yaw.toFixed(2)})`, yaw < -0.05);
    const small = await drag('#stick-move', 4, 0, 200);
    check('데드존: 살짝 닿은 정도는 무시', small.joy.x === 0 && small.joy.y === 0);
    check('손을 떼면 스틱 입력 0으로 복귀', await M.evaluate(() => { const c = window.__cathedral.controls; return !c.joy.x && !c.joy.y && !c.lookJoy.x && !c.lookJoy.y; }));

    await M.evaluate(() => { const c = window.__cathedral.controls; c.pos.set(-0.9, 0, window.__cathedral.world.seats[4].z); });
    await M.waitForFunction(() => document.querySelector('#btn-interact').textContent === '🪑 앉기');
    await M.tap('#btn-interact');
    await wait(200);
    check('🪑 앉기 버튼으로 착석', await M.evaluate(() => !!window.__cathedral.controls.seat));
    await M.waitForFunction(() => document.querySelector('#btn-interact').textContent === '🧍 일어서기', null, { timeout: 5000 }).catch(() => {});
    check('착석 후 버튼이 🧍 일어서기로 변경', (await M.textContent('#btn-interact')) === '🧍 일어서기');
    await M.tap('#btn-interact');
    await wait(200);
    check('🧍 일어서기 버튼으로 일어남', await M.evaluate(() => !window.__cathedral.controls.seat));

    // A(요셉) 앞에 서서 아바타를 톡 누르기
    await A.page.evaluate(() => { const c = window.__cathedral.controls; c.pos.set(0, 0, 10); c.yaw = Math.PI; });
    await M.evaluate(() => { const c = window.__cathedral.controls; c.pos.set(0, 0, 12); c.yaw = 0; c.pitch = 0; });
    await M.waitForFunction(() => [...window.__cathedral.avatars.items.values()].some((it) => it.name === '요셉' && Math.abs(it.g.position.z - 10) < 0.05), null, { timeout: 15000 });
    await M.touchscreen.tap(195, 410);
    await M.waitForSelector('#avatar-card:not([hidden])', { timeout: 5000 }).catch(() => {});
    check('스마트폰: 아바타를 톡 눌러 인사 카드 열기', (await M.isVisible('#avatar-card')) && (await M.textContent('#ac-name')) === '요셉');
    await M.tap('#ac-close');
    check('스마트폰: 🕊 평화의 인사 버튼 표시', await M.isVisible('#btn-peace'));

    await M.tap('#btn-chat');
    check('💬 버튼으로 채팅 입력창 열림', await M.isVisible('#chat-input'));
    await M.tap('#btn-help');
    check('❓ 버튼으로 조작 안내 다시 열기', await M.isVisible('#help-dialog'));
    await M.tap('#help-dialog [data-tab=desktop]');
    check('컴퓨터 탭 전환', await M.isVisible('#help-dialog [data-panel=desktop]'));
    check('스마트폰 페이지 런타임 오류 없음', mErrors.length === 0);
    await mctx.close();

    console.log('8) 퇴장 처리');
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
