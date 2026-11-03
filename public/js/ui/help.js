// 조작 안내 창: 기기별 탭(스마트폰/컴퓨터) + 첫 입장 시 1회 자동 표시
import { $ } from './dom.js';

const SEEN_KEY = 'cathedral.helpSeen';

export class HelpUI {
  constructor() {
    this.dlg = $('#help-dialog');
    this.tabs = [...this.dlg.querySelectorAll('[data-tab]')];
    this.panels = [...this.dlg.querySelectorAll('[data-panel]')];
    this.tabs.forEach((t) => t.addEventListener('click', () => this.select(t.dataset.tab)));
  }

  select(name) {
    this.tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    this.panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }

  /** 현재 기기에 맞는 탭을 먼저 보여준다 */
  open() {
    document.exitPointerLock?.();
    this.select(document.body.classList.contains('touch') ? 'touch' : 'desktop');
    if (!this.dlg.open) this.dlg.showModal();
  }

  /** 처음 입장한 기기에서만 자동 표시 (저장소 접근 실패 시에도 정상 동작) */
  openFirstTime() {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* 사생활 보호 모드 등 */ }
    if (seen) return;
    this.open();
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* 무시 */ }
  }
}
