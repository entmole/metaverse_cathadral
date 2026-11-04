// 1인칭 이동·시점 조작(데스크톱: 포인터락+WASD / 모바일: 듀얼 조이스틱+드래그)
import * as THREE from 'three';

const EYE = { stand: 1.62, sit: 1.12, kneel: 0.98 };
const SPEED = 3.2;      // m/s
const RADIUS = 0.3;     // 충돌 반경
const LOOK_SPEED = { yaw: 2.4, pitch: 1.6 }; // 시점 스틱 최대 회전 속도(rad/s)
const WORLD = { minX: -11.6, maxX: 11.6, minZ: -27.6, maxZ: 29.6 };

export class PlayerControls {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} dom 캔버스
   * @param {{minX,maxX,minZ,maxZ}[]} colliders
   */
  constructor(camera, dom, colliders) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;
    this.pos = new THREE.Vector3(0, 0, 27);
    this.yaw = 0;
    this.pitch = 0;
    this.pose = 'stand';
    this.seat = null;         // 앉은 좌석 {x,z}
    this.enabled = true;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };      // 이동 스틱 (-1~1)
    this.lookJoy = { x: 0, y: 0 };  // 시점 스틱 (-1~1)
    this.eye = EYE.stand;
    this.onInteract = null;   // E키 콜백
    this.onPick = null;       // (screenPoint|null) => boolean : 아바타를 눌렀으면 true
    this.onKey = null;        // 기타 단축키 콜백 (code) => void
    this.nodStart = -1;       // 내가 인사할 때 시선을 살짝 숙이는 연출
    this.onLeaveSeat = null;
    this.#bind();
  }

  get isLocked() { return document.pointerLockElement === this.dom; }

  #bind() {
    const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
    addEventListener('keydown', (e) => {
      if (!this.enabled || typing()) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'KeyE') this.onInteract?.();
      else this.onKey?.(k);
      if (this.seat && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) this.leaveSeat();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // 데스크톱: 클릭 → 아바타 선택(잠금 중이면 화면 중앙 조준점 기준), 아니면 포인터락
    this.dom.addEventListener('click', (e) => {
      if (!this.enabled || document.body.classList.contains('touch')) return; // 터치는 아래 탭 감지로 처리
      if (this.onPick?.(this.isLocked ? null : { x: e.clientX, y: e.clientY })) {
        document.exitPointerLock?.();
        return;
      }
      if (matchMedia('(pointer: fine)').matches && !this.isLocked) this.dom.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', this.isLocked));
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || !this.enabled) return;
      this.#look(e.movementX, e.movementY, 0.0022);
    });

    // 모바일: 캔버스 드래그로 시점 회전
    let last = null;
    let tap = null; // 짧게 톡 누름(아바타 선택) 판별용
    this.dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      tap = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() };
    });
    this.dom.addEventListener('pointerup', (e) => {
      if (!tap || e.pointerId !== tap.id) return;
      const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
      if (this.enabled && moved < 12 && performance.now() - tap.t < 500) this.onPick?.({ x: e.clientX, y: e.clientY });
      tap = null;
    });
    this.dom.addEventListener('pointermove', (e) => {
      if (!last || e.pointerId !== last.id || !this.enabled) return;
      this.#look(e.clientX - last.x, e.clientY - last.y, 0.005);
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    const end = (e) => { if (last && e.pointerId === last.id) last = null; };
    this.dom.addEventListener('pointerup', end);
    this.dom.addEventListener('pointercancel', end);
  }

  /**
   * 범용 가상 조이스틱. 스틱마다 pointerId를 따로 잡아 양손 동시 조작을 지원한다.
   * @param {HTMLElement} el `.knob` 자식을 가진 원형 영역
   * @param {(v:{x:number,y:number}) => void} onChange 데드존 보정된 -1~1 벡터
   */
  #stick(el, onChange) {
    const knob = el.querySelector('.knob');
    const DEAD = 0.15;
    let id = null;
    const set = (e) => {
      const r = el.getBoundingClientRect();
      const R = r.width * 0.38; // 손잡이 최대 이동 반경
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, len / R);
      // 데드존 이하 무시, 그 이상은 0~1로 재스케일
      const k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD) / (m || 1);
      onChange({ x: (dx / R) * k, y: (dy / R) * k });
    };
    const reset = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      el.classList.remove('active');
      onChange({ x: 0, y: 0 });
    };
    el.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch { /* 캡처 미지원 환경: 이벤트는 그대로 처리 */ }
      el.classList.add('active');
      set(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    el.addEventListener('pointerup', reset);
    el.addEventListener('pointercancel', reset);
  }

  /** 왼쪽 스틱: 이동 (앉아 있을 때 밀면 일어남) */
  attachMoveStick(el) {
    this.#stick(el, (v) => {
      this.joy = v;
      if (this.seat && Math.hypot(v.x, v.y) > 0.5) this.leaveSeat();
    });
  }

  /** 오른쪽 스틱: 시점 회전 (update에서 연속 회전) */
  attachLookStick(el) {
    this.#stick(el, (v) => { this.lookJoy = v; });
  }

  #look(dx, dy, s) {
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.3, 1.3);
  }

  sitAt(seat) {
    this.seat = seat;
    this.pos.set(seat.x, 0, seat.z);
    this.yaw = 0;           // 제대 방향
    this.pitch = 0.05;
    this.pose = 'sit';
  }

  /** 좌석에서 일어나 가장 가까운 통로로 이동 */
  leaveSeat() {
    if (!this.seat) return;
    const x = this.seat.x;
    const aisleX = Math.abs(x) < 3.7 ? 0 : Math.sign(x) * 9.3;
    this.pos.set(aisleX, 0, this.seat.z);
    this.seat = null;
    this.pose = 'stand';
    this.onLeaveSeat?.();
  }

  setPose(pose) { if (EYE[pose]) this.pose = pose; }

  /** 내 인사 동작: 1.2초 동안 시선을 숙였다 듦 */
  nod() { this.nodStart = performance.now(); }

  #blocked(x, z) {
    if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return true;
    for (const c of this.colliders) {
      if (x > c.minX - RADIUS && x < c.maxX + RADIUS && z > c.minZ - RADIUS && z < c.maxZ + RADIUS) return true;
    }
    return false;
  }

  update(dt) {
    const L = this.lookJoy;
    if (this.enabled && (L.x || L.y)) {
      const curve = (v) => Math.sign(v) * v * v;
      this.yaw -= curve(L.x) * LOOK_SPEED.yaw * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch - curve(L.y) * LOOK_SPEED.pitch * dt, -1.3, 1.3);
    }
    if (this.enabled && !this.seat) {
      let f = 0, s = 0;
      const K = this.keys;
      if (K.has('KeyW') || K.has('ArrowUp')) f += 1;
      if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) s += 1;
      if (K.has('KeyA') || K.has('ArrowLeft')) s -= 1;
      f -= this.joy.y; s += this.joy.x;
      const len = Math.hypot(f, s);
      if (len > 0.05) {
        const n = Math.min(1, len);
        f /= len; s /= len;
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        // 카메라 전방 = (-sin, -cos), 우측 = (cos, -sin)
        const vx = (-sin * f + cos * s) * SPEED * n * dt;
        const vz = (-cos * f - sin * s) * SPEED * n * dt;
        // 축별 분리 이동 → 벽을 따라 미끄러짐
        if (!this.#blocked(this.pos.x + vx, this.pos.z)) this.pos.x += vx;
        if (!this.#blocked(this.pos.x, this.pos.z + vz)) this.pos.z += vz;
      }
    }
    this.eye += (EYE[this.pose] - this.eye) * Math.min(1, dt * 6);
    this.camera.position.set(this.pos.x, this.eye, this.pos.z);
    let nod = 0;
    if (this.nodStart >= 0) {
      const t = (performance.now() - this.nodStart) / 1200;
      if (t >= 1) this.nodStart = -1; else nod = Math.sin(t * Math.PI) * 0.35;
    }
    this.camera.rotation.set(this.pitch - nod, this.yaw, 0, 'YXZ');
  }
}
