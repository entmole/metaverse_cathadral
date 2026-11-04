// 채팅창: 메시지 표시(최대 60개 유지) + 입력
import { $, h } from './dom.js';

const MAX_LINES = 60;

export class ChatUI {
  constructor(net) {
    this.net = net;
    this.log = $('#chat-log');
    this.input = $('#chat-input');
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (text) net.send({ t: 'chat', text });
      this.input.value = '';
      this.input.blur();
    });
    // Enter: 채팅 입력 포커스 / Esc: 해제
    addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.input && !document.querySelector('#confession:not([hidden]), dialog[open]')) {
        e.preventDefault();
        document.exitPointerLock?.();
        this.input.focus();
      } else if (e.key === 'Escape' && document.activeElement === this.input) {
        this.input.blur();
      }
    });
  }

  add({ name, text }) {
    this.#push(h('li', {}, h('b', {}, name), text));
  }

  system(text) {
    this.#push(h('li', { class: 'sys' }, text));
  }

  #push(li) {
    this.log.append(li);
    while (this.log.children.length > MAX_LINES) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}
