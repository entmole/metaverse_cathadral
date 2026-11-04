// 성당 사운드 엔진 (Web Audio 합성 — 외부 음원 파일·저작권 음원 없음)
//  ├─ 배경 오르간: 느린 화음 진행 + 가끔 들리는 플루트 선율
//  ├─ 실내 공기음: 아주 작은 저역 노이즈
//  ├─ 성당 잔향: 합성 임펄스 응답(약 4.5초) 컨볼루션 리버브
//  └─ 종소리: 비조화 배음 합성
// 신호 흐름: 소스 → (dry) + reverb(wet) → master(음량) → 스피커

const PREF_KEY = 'cathedral.sound';
/** 미사 단계별 오르간 크기 (mass-order.json의 ambience 값) */
const LEVELS = { organ: 1, prelude: 0.6, soft: 0.4, silent: 0 };

// D장조 기반의 차분한 화음 진행 (MIDI 음번호: 베이스 + 3성부)
const PROGRESSION = [
  [38, 57, 62, 66], // D
  [35, 54, 59, 62], // Bm
  [31, 55, 59, 62], // G
  [33, 57, 61, 64], // A
  [38, 57, 62, 66], // D
  [43, 55, 59, 62], // G (높은 베이스)
  [40, 55, 59, 64], // Em
  [33, 52, 57, 61], // A
];
const CHORD_SEC = 9;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

let ctx = null;
let nodes = null;           // { master, ambientBus, organBus, reverb, ... }
let chordTimer = null;
let melodyTimer = null;
let chordIdx = 0;
let level = 'prelude';
let prefs = { ambient: true, bell: true, volume: 0.8 };

// ───────── 환경설정(브라우저별 편의 저장, 실패해도 기본값으로 동작) ─────────
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { /* 무시 */ }
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* 무시 */ } };

/** 성당 잔향용 임펄스 응답: 초기 반사 + 지수 감쇠 노이즈(스테레오) */
function makeImpulse(seconds = 4.5, decay = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * (1 - t) ** decay;
    }
    // 초기 반사음(벽·기둥)
    for (const ms of [17, 29, 41, 63, 87]) d[Math.floor((ms / 1000) * rate)] += (ch ? 0.5 : 0.6) * Math.random();
  }
  return buf;
}

/** 저역 노이즈(실내 공기음) 버퍼 */
function makeRoomNoise(seconds = 4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // 브라운 노이즈
  return buf;
}

function build() {
  const master = ctx.createGain();
  master.gain.value = prefs.volume;
  master.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse();
  const wet = ctx.createGain(); wet.gain.value = 0.85;
  reverb.connect(wet).connect(master);

  // 배경음 묶음(오르간+공기음): 켜기/끄기 담당
  const ambientBus = ctx.createGain();
  ambientBus.gain.value = 0;
  ambientBus.connect(master);
  ambientBus.connect(reverb);

  // 오르간: 미사 단계별 크기 담당 + 부드러운 음색(저역통과)
  const organBus = ctx.createGain();
  organBus.gain.value = LEVELS[level];
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 1600; tone.Q.value = 0.4;
  organBus.connect(tone).connect(ambientBus);

  // 실내 공기음(항상 아주 작게)
  const room = ctx.createBufferSource();
  room.buffer = makeRoomNoise(); room.loop = true;
  const roomLp = ctx.createBiquadFilter(); roomLp.type = 'lowpass'; roomLp.frequency.value = 380;
  const roomGain = ctx.createGain(); roomGain.gain.value = 0.05;
  room.connect(roomLp).connect(roomGain).connect(ambientBus);
  room.start();

  // 종소리 전용(배경음 끄기와 무관)
  const bellBus = ctx.createGain();
  bellBus.connect(master);
  bellBus.connect(reverb);

  nodes = { master, reverb, ambientBus, organBus, bellBus };
}

/** 한 화음 연주: 3초에 걸쳐 커지고, 다음 화음과 겹치며 사라짐 */
function playChord() {
  if (!nodes || ctx.state !== 'running') return; // 일시정지 중 화음이 쌓였다 한꺼번에 울리는 것 방지
  const notes = PROGRESSION[chordIdx++ % PROGRESSION.length];
  const t0 = ctx.currentTime + 0.05;
  const end = t0 + CHORD_SEC + 3.5;
  notes.forEach((n, i) => {
    const env = ctx.createGain();
    const peak = i === 0 ? 0.07 : 0.045;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 3);
    env.gain.setValueAtTime(peak, t0 + CHORD_SEC - 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(nodes.organBus);
    // 파이프오르간 느낌: 기음(sine) + 옥타브(triangle) + 미세 디튠
    [[1, 'sine', 1], [2, 'triangle', 0.35], [1.003, 'sine', 0.5]].forEach(([mul, type, amp]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type; o.frequency.value = midi(n) * mul; g.gain.value = amp;
      o.connect(g).connect(env);
      o.start(t0); o.stop(end + 0.1);
    });
  });
}

/** 가끔 들리는 플루트 한 음(화음 구성음 중 높은 음) */
function playFlute() {
  if (!nodes || ctx.state !== 'running' || Math.random() < 0.45) return;
  const chord = PROGRESSION[(chordIdx - 1 + PROGRESSION.length) % PROGRESSION.length];
  const n = chord[1 + Math.floor(Math.random() * 3)] + 12;
  const t0 = ctx.currentTime + 0.05;
  const dur = 2.5 + Math.random() * 2;
  const o = ctx.createOscillator();
  const vib = ctx.createOscillator();
  const vibGain = ctx.createGain();
  const env = ctx.createGain();
  o.type = 'sine'; o.frequency.value = midi(n);
  vib.frequency.value = 5; vibGain.gain.value = midi(n) * 0.004; // 비브라토
  vib.connect(vibGain).connect(o.frequency);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.022, t0 + 0.8);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(env).connect(nodes.organBus);
  o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.1); vib.stop(t0 + dur + 0.1);
}

function startAmbient() {
  if (!nodes || chordTimer) return;
  nodes.ambientBus.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
  playChord();
  chordTimer = setInterval(playChord, CHORD_SEC * 1000);
  melodyTimer = setInterval(playFlute, 3000);
}

function stopAmbient() {
  if (!nodes) return;
  nodes.ambientBus.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
  clearInterval(chordTimer); clearInterval(melodyTimer);
  chordTimer = melodyTimer = null;
}

// ───────── 공개 API ─────────

/** 사용자 제스처(입장 버튼) 안에서 호출해야 소리가 납니다(브라우저 자동재생 정책) */
export function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    build();
    // 탭이 숨겨지면 일시정지(배터리 절약), 다시 보이면 재개
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (prefs.ambient) startAmbient();
}

export const getPrefs = () => ({ ...prefs });

export function setAmbient(on) {
  prefs.ambient = !!on; savePrefs();
  if (!ctx) return;
  if (on) startAmbient(); else stopAmbient();
}

export function setBellOn(on) { prefs.bell = !!on; savePrefs(); }

export function setVolume(v) {
  prefs.volume = Math.min(1, Math.max(0, v)); savePrefs();
  if (nodes) nodes.master.gain.setTargetAtTime(prefs.volume, ctx.currentTime, 0.05);
}

/** 미사 단계에 맞춰 오르간 크기를 4초에 걸쳐 바꿈 ('organ'|'prelude'|'soft'|'silent') */
export function setAmbienceLevel(name) {
  level = name in LEVELS ? name : 'soft';
  if (nodes) nodes.organBus.gain.setTargetAtTime(LEVELS[level], ctx.currentTime, 1.5);
}

/** 교회 종: 비조화 배음(hum·prime·tierce·quint·nominal) 합성 */
export function bell(times = 3, base = 392) {
  if (!ctx || !prefs.bell) return;
  const partials = [[0.5, 0.35], [1, 0.5], [1.2, 0.25], [1.5, 0.18], [2, 0.3], [2.74, 0.08]];
  for (let n = 0; n < times; n++) {
    const t0 = ctx.currentTime + n * 0.9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);
    env.connect(nodes.bellBus);
    for (const [ratio, amp] of partials) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = base * ratio;
      g.gain.value = amp;
      o.connect(g).connect(env);
      o.start(t0);
      o.stop(t0 + 3.6);
    }
  }
}

/** 테스트·디버깅용 상태 */
export function audioState() {
  return {
    ctx: ctx?.state ?? 'none',
    ambientPlaying: !!chordTimer,
    level,
    organGain: nodes ? LEVELS[level] : null,
    prefs: { ...prefs },
  };
}
