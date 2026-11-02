// Web Audio 합성 종소리(외부 음원 파일 불필요)
let ctx = null;
let enabled = true;

export function initAudio() {
  // 브라우저 자동재생 정책: 사용자 제스처(입장 버튼) 이후 호출
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

export function setSound(on) { enabled = on; }
export function isSoundOn() { return enabled; }

/** 교회 종: 비조화 배음(hum·prime·tierce·quint·nominal) 합성 */
export function bell(times = 3, base = 392) {
  if (!ctx || !enabled) return;
  const partials = [[0.5, 0.35], [1, 0.5], [1.2, 0.25], [1.5, 0.18], [2, 0.3], [2.74, 0.08]];
  for (let n = 0; n < times; n++) {
    const t0 = ctx.currentTime + n * 0.9;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);
    master.connect(ctx.destination);
    for (const [ratio, amp] of partials) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = base * ratio;
      g.gain.value = amp;
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 3.6);
    }
  }
}
