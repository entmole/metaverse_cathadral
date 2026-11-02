// 고해 준비 화면 (클라이언트 전용)
// ⚠ 개인정보 원칙: 성찰 체크·메모는 이 모듈의 메모리에만 존재한다.
//   - 서버/WebSocket 전송 금지, localStorage·sessionStorage·쿠키 저장 금지
//   - 고해소를 나가면 DOM과 변수를 즉시 초기화
import { $, h } from './dom.js';

export class ConfessionUI {
  /**
   * @param {object} data examination.json
   * @param {() => void} onClose 닫힘 콜백(고해소 퇴장 처리)
   */
  constructor(data, onClose) {
    this.data = data;
    this.onClose = onClose;
    this.step = 0;
    this.checked = new Set();
    this.memo = '';
    this.el = {
      root: $('#confession'), body: $('#conf-body'), notice: $('#conf-notice'),
      steps: [...document.querySelectorAll('#conf-steps li')],
      prev: $('#conf-prev'), next: $('#conf-next'), close: $('#conf-close'),
    };
    this.el.notice.textContent = data.notice;
    this.el.prev.addEventListener('click', () => this.go(this.step - 1));
    this.el.next.addEventListener('click', () => (this.step === 3 ? this.close() : this.go(this.step + 1)));
    this.el.close.addEventListener('click', () => this.close());
    this.el.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  get isOpen() { return !this.el.root.hidden; }

  open() {
    this.#wipe();
    this.el.root.hidden = false;
    this.go(0);
    this.el.close.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.#wipe();
    this.el.root.hidden = true;
    this.onClose();
  }

  /** 성찰 기록 완전 삭제 */
  #wipe() {
    this.checked.clear();
    this.memo = '';
    this.step = 0;
    this.el.body.replaceChildren();
  }

  go(i) {
    // 성찰 단계를 벗어날 때 메모 값을 메모리 변수로만 보관
    const ta = this.el.body.querySelector('textarea');
    if (ta) this.memo = ta.value;
    this.step = Math.max(0, Math.min(3, i));
    this.el.steps.forEach((li, k) => li.classList.toggle('on', k === this.step));
    this.el.prev.hidden = this.step === 0;
    this.el.next.textContent = this.step === 3 ? '마치고 나가기' : '다음';
    this.el.body.replaceChildren(...this[`_step${this.step}`]());
    this.el.body.scrollTop = 0;
  }

  // 1) 성령 청원 기도
  _step0() {
    const o = this.data.opening;
    return [
      h('h3', {}, o.title),
      h('p', {}, '잠시 마음을 가라앉히고, 천천히 기도를 바치십시오.'),
      h('div', { class: 'prayer' }, o.text),
      h('p', { class: 'src' }, `— ${o.source}`),
    ];
  }

  // 2) 성찰 체크리스트 + 개인 메모
  _step1() {
    let n = 0;
    const groups = this.data.groups.map((g) =>
      h('fieldset', {},
        h('legend', {}, g.title),
        g.items.map((q) => {
          const key = n++;
          return h('label', { class: 'q' },
            h('input', {
              type: 'checkbox', checked: this.checked.has(key),
              onchange: (e) => (e.target.checked ? this.checked.add(key) : this.checked.delete(key)),
            }),
            h('span', {}, q));
        })));
    const memo = h('textarea', {
      placeholder: '떠오르는 잘못을 짧게 적어 두십시오. (이 기기 화면에만 잠시 보이며, 전송·저장되지 않습니다)',
      autocomplete: 'off', spellcheck: false, maxLength: 2000,
      'aria-label': '개인 성찰 메모',
    });
    memo.value = this.memo;
    return [
      h('h3', {}, '양심 성찰'),
      h('p', {}, '해당하는 항목을 표시하며 지난 고해 이후의 삶을 돌아보십시오.'),
      ...groups,
      h('fieldset', {}, h('legend', {}, '개인 메모'), memo),
    ];
  }

  // 3) 통회
  _step2() {
    const c = this.data.contrition;
    const total = this.data.groups.reduce((a, g) => a + g.items.length, 0);
    return [
      h('h3', {}, c.title),
      h('p', { class: 'summary' }, `성찰 항목 ${total}개 중 ${this.checked.size}개를 표시했습니다. 하느님의 자비를 신뢰하며 뉘우치십시오.`),
      h('p', {}, c.guide),
      h('div', { class: 'prayer' }, c.text),
      h('p', { class: 'src' }, `— ${c.source}`),
    ];
  }

  // 4) 실제 고해성사 안내
  _step3() {
    const p = this.data.procedure;
    return [
      h('h3', {}, p.title),
      h('ol', { class: 'proc' }, p.steps.map((s) => h('li', {}, s))),
      h('ul', { class: 'tips' }, p.tips.map((s) => h('li', {}, s))),
      h('p', {}, '가까운 본당 고해 시간 확인: ',
        h('a', { href: p.link.url, target: '_blank', rel: 'noopener noreferrer' }, p.link.label)),
      h('p', { class: 'summary' }, '「마치고 나가기」를 누르면 이 화면의 모든 표시와 메모가 지워집니다.'),
    ];
  }
}
