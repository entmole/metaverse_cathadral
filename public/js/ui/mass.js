// 미사 진행 HUD: 서버의 자동 진행 상태(휴식·단계)를 받아 안내·응답 버튼·남은 시간 표시
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
    this.phaseEndsAt = 0; // 로컬 시계 기준 현재 단계(또는 휴식) 종료 시각
    this.el = {
      panel: $('#mass-panel'), part: $('#mass-part'), mode: $('#mass-mode'), title: $('#mass-title'),
      desc: $('#mass-desc'), posture: $('#mass-posture'), responses: $('#mass-responses'),
      progress: $('#mass-progress'), timer: $('#mass-timer'),
    };
    $('#mass-collapse').addEventListener('click', () => this.el.panel.classList.toggle('collapsed'));
    setInterval(() => this.#tick(), 250);
  }

  get currentStep() {
    const s = this.state;
    return s?.mode === 'running' ? this.order.steps[s.stepIndex] ?? null : null;
  }

  render(state) {
    const prevKey = this.state && `${this.state.massCount}:${this.state.stepIndex}`;
    this.state = state;
    this.phaseEndsAt = Date.now() + (state.leftMs || 0);
    const step = this.currentStep;
    const E = this.el;

    if (!step) {
      // 휴식(다음 미사 대기)
      E.part.textContent = '미사 전';
      E.mode.textContent = state.massCount > 0 ? `${state.massCount}번째 미사를 마쳤습니다` : '';
      E.title.textContent = '곧 미사가 시작됩니다';
      E.desc.textContent = '잠시 마음을 가다듬으십시오. 입당 성가와 함께 미사가 자동으로 시작됩니다.';
      E.posture.textContent = '';
      E.responses.replaceChildren();
      E.progress.style.width = '0%';
    } else {
      E.part.textContent = this.order.parts[step.part];
      E.mode.textContent = `${state.massCount}번째 미사 · 자동 진행`;
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
    this.onStep(step, prevKey !== `${state.massCount}:${state.stepIndex}`);
  }

  #tick() {
    const s = this.state;
    if (!s) return;
    const left = Math.max(0, Math.ceil((this.phaseEndsAt - Date.now()) / 1000));
    if (s.mode === 'break') {
      this.el.timer.textContent = `다음 미사까지 ${left}초 · ${this.order.notice}`;
    } else if (s.mode === 'running') {
      this.el.timer.textContent = `${s.stepIndex + 1} / ${s.total} · 다음 단계까지 ${left}초`;
    } else {
      this.el.timer.textContent = this.order.notice;
    }
  }
}
