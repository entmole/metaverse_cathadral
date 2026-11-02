// WebSocket 클라이언트: JSON 메시지 송수신 + 지수 백오프 재접속
export class Net extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.name = '';
    this.retry = 0;
    this.closedByUser = false;
  }

  connect(name) {
    this.name = name;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.send({ t: 'join', name: this.name });
      this.#emit('open');
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.#emit(msg.t, msg);
    };
    ws.onclose = () => {
      this.#emit('close');
      if (this.closedByUser) return;
      // 1s → 2s → 4s … 최대 15s
      const delay = Math.min(15000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(this.name), delay);
    };
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); }

  #emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
