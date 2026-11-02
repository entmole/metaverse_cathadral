// 1인칭 이동·시점 조작(데스크톱: 포인터락+WASD / 모바일: 조이스틱+드래그)
import * as THREE from 'three';

const EYE = { stand: 1.62, sit: 1.12, kneel: 0.98 };
const SPEED = 3.2;      // m/s
const RADIUS = 0.3;     // 충돌 반경
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
    this.joy = { x: 0, y: 0 };
    this.eye = EYE.stand;
    this.onInteract = null;   // E키 콜백
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
      if (this.seat && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) this.leaveSeat();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // 데스크톱: 클릭 시 포인터락
    this.dom.addEventListener('click', () => {
      if (this.enabled && matchMedia('(pointer: fine)').matches && !this.isLocked) this.dom.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', this.isLocked));
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || !this.enabled) return;
      this.#look(e.movementX, e.movementY, 0.0022);
    });

    // 모바일: 캔버스 드래그로 시점 회전
    let last = null;
    this.dom.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') last = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    this.dom.addEventListener('pointermove', (e) => {
      if (!last || e.pointerId !== last.id || !this.enabled) return;
      this.#look(e.clientX - last.x, e.clientY - last.y, 0.005);
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    const end = (e) => { if (last && e.pointerId === last.id) last = null; };
    this.dom.addEventListener('pointerup', end);
    this.dom.addEventListener('pointercancel', end);
  }

  /** 가상 조이스틱 연결 */
  attachJoystick(el) {
    const knob = el.querySelector('.knob');
    let id = null;
    const R = 46;
    const set = (e) => {
      const r = el.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = { x: dx / R, y: dy / R };
      if (this.seat && Math.hypot(this.joy.x, this.joy.y) > 0.5) this.leaveSeat();
    };
    el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); set(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const reset = () => { id = null; this.joy = { x: 0, y: 0 }; knob.style.transform = ''; };
    el.addEventListener('pointerup', reset);
    el.addEventListener('pointercancel', reset);
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

  #blocked(x, z) {
    if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return true;
    for (const c of this.colliders) {
      if (x > c.minX - RADIUS && x < c.maxX + RADIUS && z > c.minZ - RADIUS && z < c.maxZ + RADIUS) return true;
    }
    return false;
  }

  update(dt) {
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
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
