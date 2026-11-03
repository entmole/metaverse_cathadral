// 진입점: 입장 → 3D 장면·네트워크·UI 연결 → 렌더 루프
import * as THREE from 'three';
import { buildCathedral } from './scene/cathedral.js';
import { AvatarManager } from './scene/avatar.js';
import { PlayerControls } from './controls.js';
import { Net } from './network.js';
import { MassUI } from './ui/mass.js';
import { ChatUI } from './ui/chat.js';
import { ConfessionUI } from './ui/confession.js';
import { initAudio, bell, setSound, isSoundOn } from './audio.js';
import { HelpUI } from './ui/help.js';
import { $, toast } from './ui/dom.js';

// ───────── 터치 기기 판별 ─────────
// 터치 위주 기기면 시작부터 조이스틱 UI, 이후 실제 입력 종류(터치/마우스)에 따라 자동 전환
const setTouchMode = (on) => document.body.classList.toggle('touch', on);
setTouchMode(matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches));
addEventListener('pointerdown', (e) => setTouchMode(e.pointerType !== 'mouse'), { capture: true });

const INTERACT_DIST = 1.8;
const SEND_HZ = 12;

const [massOrder, examination] = await Promise.all([
  fetch('/data/mass-order.json').then((r) => r.json()),
  fetch('/data/examination.json').then((r) => r.json()),
]);

// ───────── 3D 장면 ─────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('#app').append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0908);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
const world = buildCathedral(scene);
const avatars = new AvatarManager(scene);
const controls = new PlayerControls(camera, renderer.domElement, world.colliders);
controls.attachMoveStick($('#stick-move'));
controls.attachLookStick($('#stick-look'));
controls.enabled = false;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ───────── 네트워크·UI ─────────
const net = new Net();
const chat = new ChatUI(net);
let selfId = null;
let isHost = false;
let followPosture = true;
let booths = {};
let myBooth = null;

const massUI = new MassUI(net, massOrder, (step, changed) => {
  world.setLightMode(step?.light || 'normal');
  if (!changed) return;
  if (step?.bell) bell(step.id === 'consecration' ? 3 : 2);
  // 신자석에 있으면 단계 자세를 자동으로 따름
  if (step && followPosture && controls.seat) controls.setPose(step.posture === 'stand' ? 'stand' : step.posture);
  if (step) chat.system(`✝ ${massOrder.parts[step.part]} — ${step.title}`);
  chat.setSilence(massUI.state.silence, isHost);
});

const confession = new ConfessionUI(examination, () => {
  net.send({ t: 'booth', action: 'leave' });
  // 고해소 앞으로 나와 시선을 신랑 쪽으로
  const b = world.booths.find((x) => x.id === myBooth);
  if (b) { controls.pos.set(b.entry.x, 0, b.entry.z); controls.yaw = b.entry.x < 0 ? -Math.PI / 2 : Math.PI / 2; }
  myBooth = null;
  controls.enabled = true;
});

net.on('welcome', (m) => {
  selfId = m.id;
  avatars.clear();
  for (const p of m.players) if (p.id !== selfId) avatars.add(p);
  booths = m.booths;
  for (const [id, busy] of Object.entries(booths)) world.setBoothBusy(id, busy);
  massUI.setHost(false);
  isHost = false;
  massUI.render(m.mass);
  setCount(m.players.length);
  $('#topbar .presence').classList.remove('offline');
  chat.system('성당에 들어왔습니다. 평화를 빕니다.');
});
net.on('join', (m) => { avatars.add(m.player); setCount(avatars.items.size + 1); chat.system(`${m.player.name} 님이 들어왔습니다.`); });
net.on('leave', (m) => { avatars.remove(m.id); setCount(avatars.items.size + 1); });
net.on('state', (m) => avatars.applyState(m.p, selfId));
net.on('chat', (m) => { chat.add(m); avatars.bubble(m.id, m.text.length > 24 ? `${m.text.slice(0, 24)}…` : m.text); });
net.on('respond', (m) => {
  avatars.bubble(m.id, m.text);
  if (m.id === selfId) toast(`🙏 ${m.text}`, 1500);
});
net.on('mass', (m) => { massUI.render(m.state); chat.setSilence(m.state.silence, isHost); });
net.on('booths', (m) => { booths = m.booths; for (const [id, busy] of Object.entries(booths)) world.setBoothBusy(id, busy); });
net.on('boothResult', (m) => {
  if (!m.ok) return toast(m.msg || '들어갈 수 없습니다.');
  myBooth = m.id;
  controls.enabled = false;
  document.exitPointerLock?.();
  confession.open();
});
net.on('host', (m) => {
  isHost = !!m.ok;
  massUI.setHost(isHost);
  chat.setSilence(massUI.state?.silence, isHost);
  $('#btn-host').textContent = isHost ? '진행자 ✓' : '진행자';
  toast(m.ok ? '진행자 권한을 받았습니다.' : m.msg);
});
net.on('notice', (m) => toast(m.msg));
net.on('error', (m) => { $('#join-error').textContent = m.msg; });
net.on('close', () => { $('#topbar .presence').classList.add('offline'); });

function setCount(n) { $('#count').textContent = n; }

// ───────── 상호작용(E키) ─────────
function nearestInteraction() {
  const p = controls.pos;
  if (controls.seat) return { type: 'leave', btn: '🧍 일어서기', label: 'E 또는 이동키: 일어나 나가기' };
  for (const b of world.booths) {
    if (Math.hypot(p.x - b.entry.x, p.z - b.entry.z) < INTERACT_DIST) {
      return booths[b.id]
        ? { type: 'busy', label: '🔴 고해소 사용 중 — 잠시 기다려 주십시오' }
        : { type: 'booth', id: b.id, btn: '✝ 고해 준비', label: 'E: 고해소에 들어가 고해 준비하기' };
    }
  }
  let best = null, bd = 1.6;
  for (const s of world.seats) {
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { type: 'seat', seat: best, btn: '🪑 앉기', label: 'E: 신자석에 앉기' } : null;
}

controls.onInteract = () => {
  const it = nearestInteraction();
  if (!it) return;
  if (it.type === 'leave') controls.leaveSeat();
  else if (it.type === 'booth') net.send({ t: 'booth', action: 'enter', id: it.id });
  else if (it.type === 'seat') {
    controls.sitAt(it.seat);
    const step = massUI.currentStep;
    if (step && followPosture) controls.setPose(step.posture);
  }
};
$('#btn-interact').addEventListener('click', () => controls.onInteract());

// 모바일 채팅: 💬 버튼으로 입력창 열기/닫기
const chatInput = $('#chat-input');
$('#btn-chat').addEventListener('click', () => {
  const open = !document.body.classList.contains('chat-open');
  document.body.classList.toggle('chat-open', open);
  if (open) chatInput.focus(); else chatInput.blur();
});
chatInput.addEventListener('blur', () => setTimeout(() => {
  if (document.activeElement !== chatInput) document.body.classList.remove('chat-open');
}, 150));

// 조작 안내
const help = new HelpUI();
$('#btn-help').addEventListener('click', () => help.open());

// ───────── 상단 버튼 ─────────
$('#btn-sound').addEventListener('click', (e) => {
  setSound(!isSoundOn());
  const btn = e.currentTarget;
  btn.setAttribute('aria-pressed', String(isSoundOn()));
  btn.querySelector('.ico').textContent = isSoundOn() ? '🔔' : '🔕';
  btn.querySelector('.lbl').textContent = isSoundOn() ? ' 소리 켬' : ' 소리 끔';
});
$('#btn-follow').addEventListener('click', (e) => {
  followPosture = !followPosture;
  const btn = e.currentTarget;
  btn.setAttribute('aria-pressed', String(followPosture));
  btn.querySelector('.lbl').textContent = followPosture ? ' 자세 따라하기 켬' : ' 자세 따라하기 끔';
  toast(followPosture ? '신자석에서 미사 자세를 자동으로 따릅니다.' : '자세 자동 따라하기를 껐습니다.');
});
const hostDialog = $('#host-dialog');
$('#btn-host').addEventListener('click', () => {
  document.exitPointerLock?.();
  $('#host-key').value = '';
  hostDialog.showModal();
});
hostDialog.addEventListener('close', () => {
  if (hostDialog.returnValue === 'ok' && $('#host-key').value) net.send({ t: 'host', key: $('#host-key').value });
  $('#host-key').value = '';
});

// ───────── 입장 ─────────
$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#nick').value.trim();
  if (!name) return;
  initAudio();
  net.connect(name);
  $('#join').hidden = true;
  $('#hud').hidden = false;
  controls.enabled = true;
  controls.pos.set((Math.random() - 0.5) * 2, 0, 27);
  // 스마트폰은 화면 확보를 위해 미사 안내를 접은 상태로 시작
  if (document.body.classList.contains('touch')) $('#mass-panel').classList.add('collapsed');
  help.openFirstTime();
});

// ───────── 루프 ─────────
const clock = new THREE.Clock();
let sendAcc = 0;
let lastSent = '';
const promptEl = $('#prompt');
const interactBtn = $('#btn-interact');
let lastBtnText = '';

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  controls.update(dt);
  avatars.update(dt);
  world.update(t, dt);

  // 상호작용 안내
  if (controls.enabled) {
    const it = nearestInteraction();
    const touch = document.body.classList.contains('touch');
    // 터치 모드에서는 상황 버튼이 안내를 대신하고, '사용 중' 안내만 화면에 표시
    promptEl.hidden = !it || (touch && it.type !== 'busy');
    interactBtn.hidden = !it || it.type === 'busy';
    if (it) promptEl.textContent = it.label;
    const text = it?.btn || '';
    if (text !== lastBtnText) { interactBtn.textContent = text; lastBtnText = text; }
  } else {
    promptEl.hidden = true;
    interactBtn.hidden = true;
  }

  // 위치 전송(변화가 있을 때만)
  sendAcc += dt;
  if (selfId && sendAcc > 1 / SEND_HZ) {
    sendAcc = 0;
    const msg = { t: 'move', x: +controls.pos.x.toFixed(2), y: 0, z: +controls.pos.z.toFixed(2), ry: +controls.yaw.toFixed(2), pose: controls.pose };
    const key = `${msg.x},${msg.z},${msg.ry},${msg.pose}`;
    if (key !== lastSent) { lastSent = key; net.send(msg); }
  }
  renderer.render(scene, camera);
});

// 테스트·디버깅용 최소 노출(개인 메모는 포함하지 않음)
window.__cathedral = { controls, world, avatars, massUI, net, help };
