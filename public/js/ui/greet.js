// 인사 기능: 아바타 선택 → 인사 카드, 평화의 인사, 받은 인사 알림·답례
// 서버에는 동작 종류(bow/peace)와 대상 id만 보내고, 말풍선 문구는 각 화면에서 이름으로 만든다(임의 문구 전송 불가).
import * as THREE from 'three';
import { $ } from './dom.js';

export const GREET_DISTANCE = 6; // m

export class GreetUI {
  /**
   * @param {object} deps
   * @param {import('../network.js').Net} deps.net
   * @param {import('../scene/avatar.js').AvatarManager} deps.avatars
   * @param {import('../controls.js').PlayerControls} deps.controls
   * @param {THREE.Camera} deps.camera
   * @param {import('./chat.js').ChatUI} deps.chat
   * @param {() => {id:string|null, name:string}} deps.self
   * @param {(msg:string, ms?:number) => void} deps.toast
   */
  constructor({ net, avatars, controls, camera, chat, self, toast }) {
    Object.assign(this, { net, avatars, controls, camera, chat, self, toast });
    this.raycaster = new THREE.Raycaster();
    this.cardTarget = null;
    this.noticeFrom = null;
    this.noticeKind = null;
    this.noticeTimer = null;
    this.el = {
      card: $('#avatar-card'), name: $('#ac-name'), note: $('#ac-note'),
      bow: $('#ac-bow'), peace: $('#ac-peace'),
      notice: $('#greet-notice'), noticeText: $('#gn-text'), reply: $('#gn-reply'),
    };
    $('#ac-close').addEventListener('click', () => this.closeCard());
    this.el.bow.addEventListener('click', () => this.#send('bow', this.cardTarget));
    this.el.peace.addEventListener('click', () => this.#send('peace', this.cardTarget));
    this.el.reply.addEventListener('click', () => {
      if (this.noticeFrom) this.#send(this.noticeKind, this.noticeFrom, true);
      this.#hideNotice();
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeCard(); });

    controls.onPick = (pt) => this.pickAt(pt);
    net.on('gesture', (m) => this.#onGesture(m));
    net.on('leave', (m) => {
      if (m.id === this.cardTarget) this.closeCard();
      if (m.id === this.noticeFrom) this.#hideNotice();
    });
  }

  /** 모두에게 평화의 인사 */
  peaceToAll() { this.#send('peace', null); }

  /** 화면 좌표(없으면 중앙 조준점)의 아바타를 찾아 카드 열기 */
  pickAt(pt) {
    const hit = this.#raycast(pt);
    if (!hit) return false;
    this.openCard(hit.id);
    return true;
  }

  /** 마우스 잠금 중 조준점이 가리키는 아바타 (안내 문구용) */
  aimed() {
    const hit = this.#raycast(null);
    if (!hit) return null;
    return { id: hit.id, name: this.avatars.nameOf(hit.id), near: this.#dist(hit.id) <= GREET_DISTANCE };
  }

  openCard(id) {
    this.cardTarget = id;
    this.el.name.textContent = this.avatars.nameOf(id) ?? '';
    this.el.card.hidden = false;
    this.refreshCard();
  }

  closeCard() {
    this.cardTarget = null;
    this.el.card.hidden = true;
  }

  /** 거리에 따라 버튼 활성화 (매 프레임 호출해도 가벼움) */
  refreshCard() {
    if (!this.cardTarget) return;
    const d = this.#dist(this.cardTarget);
    const near = d <= GREET_DISTANCE;
    this.el.bow.disabled = !near;
    this.el.peace.disabled = !near;
    const text = near ? '인사를 건네 보십시오.' : `조금 더 가까이 가면 인사할 수 있습니다 (지금 약 ${Math.round(d)}m).`;
    if (this.el.note.textContent !== text) this.el.note.textContent = text;
  }

  #dist(id) { return this.avatars.distanceTo(id, this.controls.pos); }

  #raycast(pt) {
    const ndc = pt
      ? new THREE.Vector2((pt.x / innerWidth) * 2 - 1, -(pt.y / innerHeight) * 2 + 1)
      : new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.avatars.pick(this.raycaster, 30);
  }

  #send(kind, to, reply = false) {
    const msg = { t: 'gesture', kind };
    if (to) {
      if (this.#dist(to) > GREET_DISTANCE) return this.toast('조금 더 가까이 가서 인사해 주십시오.');
      msg.to = to;
      if (reply) msg.reply = true;
    }
    this.net.send(msg);
    this.closeCard();
  }

  #nameOf(id) {
    const me = this.self();
    return id === me.id ? me.name : this.avatars.nameOf(id) ?? '';
  }

  /** 서버가 검증해 모두에게 보낸 인사 동작 처리 */
  #onGesture(m) {
    const me = this.self();
    const fromName = this.#nameOf(m.id);
    const toName = m.to ? this.#nameOf(m.to) : null;
    let bubble;
    if (m.kind === 'peace') bubble = '평화를 빕니다';
    else bubble = m.reply ? `${toName}님, 반갑습니다` : `${toName}님, 안녕하세요`;

    if (m.id === me.id) {
      // 내가 한 인사: 시선 숙이기 + 확인 문구
      this.controls.nod();
      this.toast(toName ? `🙇 ${toName}님께 ${m.kind === 'peace' ? '평화의 인사를' : m.reply ? '답례를' : '인사를'} 건넸습니다` : '🕊 평화를 빕니다', 1800);
      if (toName) this.chat.system(`${toName} 님께 ${m.reply ? '답례했습니다' : '인사했습니다'}.`);
      return;
    }
    this.avatars.gesture(m.id, m.kind);
    this.avatars.bubble(m.id, bubble);
    if (m.to === me.id) {
      const what = m.kind === 'peace' ? '평화의 인사를 건넸습니다 🕊' : m.reply ? '답례했습니다 🙇' : '인사했습니다 🙇';
      this.chat.system(`${fromName} 님이 ${what}`);
      this.#showNotice(m.id, `${fromName} 님이 ${what}`, m.kind, !m.reply);
    }
  }

  #showNotice(fromId, text, kind, canReply) {
    this.noticeFrom = canReply ? fromId : null;
    this.noticeKind = kind;
    this.el.noticeText.textContent = text;
    this.el.reply.hidden = !canReply;
    this.el.reply.textContent = kind === 'peace' ? '🕊 평화를 빕니다' : '🙇 답례하기';
    this.el.notice.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.#hideNotice(), 10000);
  }

  #hideNotice() {
    this.el.notice.hidden = true;
    this.noticeFrom = null;
    clearTimeout(this.noticeTimer);
  }
}
