// 미사 진행 HUD: 서버 상태를 받아 단계·응답 버튼·진행률·진행자 제어 표시
import { $, h } from './dom.js';

const POSTURE_LABEL = { stand: '🧍 일어섭니다', sit: '🪑 앉습니다', kneel: '🙏 무릎을 꿇습니다' };

export class MassUI {
  /**
   * @param {import('../network.js').Net} net
   * @param {{parts:object, steps:object[], notice:string}} order mass-order.json
   * @param {(step:object|null, changed:boolean)=>void} onStep 단계 변경 콜백
   */
  constructor(net, order, onStep) {
    this.net = net;
    this.order = order;
    this.onStep = onStep;
    this.state = null;
    this.isHost = false;
    this.el = {
      panel: $('#mass-panel'), part: $('#mass-part'), mode: $('#mass-mode'), title: $('#mass-title'),
      desc: $('#mass-desc'), posture: $('#mass-posture'), responses: $('#mass-responses'),
      progress: $('#mass-progress'), timer: $('#mass-timer'), startAuto: $('#btn-start-auto'),
      host: $('#host-controls'), silence: $('#btn-silence'),
    };
    this.el.startAuto.addEventListener('click', () => net.send({ t: 'mass', action: 'startAuto' }));
    this.el.host.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (!act) return;
      if (act === 'reset' && !confirm('미사 진행을 종료하시겠습니까?')) return;
      net.send({ t: 'mass', action: act });
    });
    $('#mass-collapse').addEventListener('click', () => this.el.panel.classList.toggle('collapsed'));
    setInterval(() => this.#tick(), 500);
  }

  setHost(on) {
    this.isHost = on;
    this.el.host.hidden = !on;
    if (this.state) this.render(this.state);
  }

  get currentStep() {
    return this.state ? this.order.steps[this.state.stepIndex] ?? null : null;
  }

  render(state) {
    const prevIndex = this.state?.stepIndex;
    this.state = state;
    this.localStart = Date.now() - (state.elapsedMs || 0);
    const step = this.currentStep;
    const E = this.el;

    E.startAuto.hidden = state.mode !== 'idle' || this.isHost;
    E.silence.textContent = state.silence ? '침묵 해제' : '침묵 모드';
    E.silence.setAttribute('aria-pressed', String(state.silence));
    E.mode.textContent = { idle: '', auto: '자동 진행', host: '진행자 진행' }[state.mode] + (state.silence ? ' · 🤫 침묵' : '');

    if (!step) {
      E.part.textContent = '미사 전';
      E.title.textContent = '미사를 기다리는 중';
      E.desc.textContent = this.isHost
        ? '「다음 ▶」을 누르면 입당부터 미사가 시작됩니다.'
        : '진행자가 미사를 시작하거나, 아래 버튼으로 자동 진행 미사를 시작할 수 있습니다.';
      E.posture.textContent = '';
      E.responses.replaceChildren();
      E.progress.style.width = '0%';
      E.timer.textContent = this.order.notice;
    } else {
      E.part.textContent = this.order.parts[step.part];
      E.title.textContent = step.title;
      E.desc.textContent = step.desc;
      E.posture.textContent = POSTURE_LABEL[step.posture] || '';
      E.responses.replaceChildren(
        ...step.responses.map((text, idx) =>
          h('button', { class: 'btn', type: 'button', onclick: () => this.net.send({ t: 'respond', idx }) }, text)),
      );
      E.progress.style.width = `${((state.stepIndex + 1) / state.total) * 100}%`;
    }
    this.#tick();
    this.onStep(step, prevIndex !== state.stepIndex);
  }

  #tick() {
    const s = this.state;
    const step = this.currentStep;
    if (!s || !step) return;
    const label = `${s.stepIndex + 1} / ${s.total}`;
    if (s.mode === 'auto' && s.duration) {
      const left = Math.max(0, Math.ceil(s.duration - (Date.now() - this.localStart) / 1000));
      this.el.timer.textContent = `${label} · 다음 단계까지 ${left}초`;
    } else {
      this.el.timer.textContent = label;
    }
  }
}
