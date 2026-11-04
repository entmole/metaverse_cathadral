// 다른 접속자 아바타: 생성·보간·자세·말풍선·인사 동작·선택(레이캐스트)
import * as THREE from 'three';
import { labelTexture } from './textures.js';

const POSE_FROM_CODE = ['stand', 'sit', 'kneel'];
// 자세별 몸 전체 높이 오프셋(m)과 상체 기울기
const POSE_SHAPE = {
  stand: { dy: 0, tilt: 0 },
  sit: { dy: -0.42, tilt: 0 },
  kneel: { dy: -0.5, tilt: 0.12 },
};
// 인사 동작: 길이(초)와 최대 숙임 각도(rad)
const GESTURE = {
  bow: { dur: 1.6, angle: 0.5 },
  peace: { dur: 2.0, angle: 0.6 },
};
const HIP = 0.85; // 상체 회전축(엉덩이) 높이

function makeSprite({ tex, aspect }, height) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(height * aspect, height, 1);
  return sp;
}

/** 숙였다 펴는 곡선: 0→1→(잠시 유지)→0 */
function bowCurve(t) {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.3) return Math.sin((t / 0.3) * Math.PI / 2);
  if (t < 0.55) return 1;
  return Math.cos(((t - 0.55) / 0.45) * Math.PI / 2);
}

export class AvatarManager {
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, any>} */
    this.items = new Map();
    this.geo = {
      robe: new THREE.CylinderGeometry(0.24, 0.32, HIP, 14),
      chest: new THREE.CapsuleGeometry(0.24, 0.3, 4, 12),
      head: new THREE.SphereGeometry(0.17, 16, 12),
      stole: new THREE.BoxGeometry(0.06, 0.62, 0.02),
      ring: new THREE.RingGeometry(0.2, 0.32, 40),
      hitbox: new THREE.CylinderGeometry(0.5, 0.5, 1.9, 10), // 손가락으로 누르기 쉽게 넉넉한 선택 영역
    };
    this.mat = {
      skin: new THREE.MeshStandardMaterial({ color: 0xe6c3a0, roughness: 0.7 }),
      stole: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.4, metalness: 0.5 }),
      hitbox: new THREE.MeshBasicMaterial({ visible: false }), // 화면에 그리지 않음
    };
    /** 평화의 인사 빛 효과(바닥 금빛 고리 + 떠오르는 빛 알갱이) */
    this.effects = [];
  }

  add(p) {
    if (this.items.has(p.id)) return;
    const g = new THREE.Group();
    const robeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(p.hue / 360, 0.35, 0.42), roughness: 0.85 });
    const body = new THREE.Group();          // 자세(앉기·무릎) 높이 조절
    const lower = new THREE.Mesh(this.geo.robe, robeMat);
    lower.position.y = HIP / 2;
    const upper = new THREE.Group();         // 엉덩이 축으로 숙이는 상체
    upper.position.y = HIP;
    const chest = new THREE.Mesh(this.geo.chest, robeMat);
    chest.position.y = 0.38;
    const head = new THREE.Mesh(this.geo.head, this.mat.skin);
    head.position.y = 0.82;
    // 앞면 영대(금색 띠): 바라보는 방향(-Z) 표시
    const stoleL = new THREE.Mesh(this.geo.stole, this.mat.stole);
    const stoleR = stoleL.clone();
    stoleL.position.set(-0.09, 0.38, -0.235);
    stoleR.position.set(0.09, 0.38, -0.235);
    upper.add(chest, head, stoleL, stoleR);
    const hitbox = new THREE.Mesh(this.geo.hitbox, this.mat.hitbox);
    hitbox.position.y = 0.95;
    body.add(lower, upper, hitbox);
    g.add(body);
    const label = makeSprite(labelTexture(p.name, { font: 26 }), 0.22);
    label.position.y = 1.95;
    g.add(label);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.ry;
    g.visible = !p.hidden;
    // 선택(레이캐스트)용 표시
    hitbox.userData.avatarId = p.id;
    this.scene.add(g);
    this.items.set(p.id, {
      g, body, upper, label, robeMat, name: p.name, picks: [hitbox],
      target: new THREE.Vector3(p.x, p.y, p.z), ry: p.ry, pose: p.pose,
      bubble: null, bubbleUntil: 0,
      gesture: null, gestureStart: 0,
    });
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.scene.remove(it.g);
    it.robeMat.dispose();
    it.label.material.map.dispose(); it.label.material.dispose();
    if (it.bubble) { it.bubble.material.map.dispose(); it.bubble.material.dispose(); }
    this.items.delete(id);
  }

  clear() { for (const id of [...this.items.keys()]) this.remove(id); }

  nameOf(id) { return this.items.get(id)?.name ?? null; }

  /** 서버 압축 상태 [id,x,y,z,ry,pose,hidden] 반영 */
  applyState(arr, selfId) {
    for (const [id, x, y, z, ry, pc, hidden] of arr) {
      if (id === selfId) continue;
      const it = this.items.get(id);
      if (!it) continue;
      it.target.set(x, y, z);
      it.ry = ry;
      it.pose = POSE_FROM_CODE[pc] || 'stand';
      it.g.visible = !hidden;
    }
  }

  bubble(id, text) {
    const it = this.items.get(id);
    if (!it) return;
    if (it.bubble) { it.g.remove(it.bubble); it.bubble.material.map.dispose(); it.bubble.material.dispose(); }
    it.bubble = makeSprite(labelTexture(text, { font: 30, color: '#2a1d0a', bg: 'rgba(246,226,176,.95)' }), 0.28);
    it.bubble.position.y = 2.3;
    it.g.add(it.bubble);
    it.bubbleUntil = performance.now() + 4000;
  }

  /** 인사 동작 재생 ('bow' | 'peace') */
  gesture(id, kind) {
    const it = this.items.get(id);
    if (!it || !GESTURE[kind]) return;
    it.gesture = kind;
    it.gestureStart = performance.now();
    if (kind === 'peace') this.#peaceEffect(it.g.position);
  }

  /** 금빛 고리가 퍼지고 빛 알갱이가 떠오르는 효과(2초) */
  #peaceEffect(pos) {
    const ring = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.03, pos.z);
    const n = 24;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      arr.set([pos.x + Math.cos(a) * 0.35, 0.3 + Math.random() * 0.8, pos.z + Math.sin(a) * 0.35], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xfff0c0, size: 0.07, transparent: true, opacity: 1, depthWrite: false, toneMapped: false,
    }));
    this.scene.add(ring, sparks);
    this.effects.push({ ring, sparks, start: performance.now() });
  }

  /** 레이캐스터로 아바타 선택 → id 또는 null */
  pick(raycaster, maxDist = 30) {
    const meshes = [];
    for (const it of this.items.values()) if (it.g.visible) meshes.push(...it.picks);
    const hit = raycaster.intersectObjects(meshes, false).find((h) => h.distance <= maxDist);
    return hit ? { id: hit.object.userData.avatarId, distance: hit.distance } : null;
  }

  distanceTo(id, pos) {
    const it = this.items.get(id);
    return it ? Math.hypot(it.target.x - pos.x, it.target.z - pos.z) : Infinity;
  }

  update(dt) {
    const k = Math.min(1, dt * 10);
    const now = performance.now();
    for (const it of this.items.values()) {
      it.g.position.lerp(it.target, k);
      // 각도 보간(최단 경로)
      let d = it.ry - it.g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      it.g.rotation.y += d * k;
      const shape = POSE_SHAPE[it.pose];
      it.body.position.y += (shape.dy - it.body.position.y) * k;
      // 상체: 자세 기울기 + 인사 동작(음수 = 앞(-Z)으로 숙임)
      let bow = 0;
      if (it.gesture) {
        const G = GESTURE[it.gesture];
        const t = (now - it.gestureStart) / 1000 / G.dur;
        bow = bowCurve(t) * G.angle;
        if (t >= 1) it.gesture = null;
      }
      const targetTilt = -shape.tilt;
      it.upper.rotation.x = it.gesture ? targetTilt - bow : it.upper.rotation.x + (targetTilt - it.upper.rotation.x) * k;
      if (it.bubble && now > it.bubbleUntil) {
        const m = it.bubble.material;
        m.opacity -= dt * 2;
        if (m.opacity <= 0) { it.g.remove(it.bubble); m.map.dispose(); m.dispose(); it.bubble = null; }
      }
    }
    // 평화의 인사 효과 진행·정리
    this.effects = this.effects.filter((e) => {
      const t = (now - e.start) / 2000;
      if (t >= 1) {
        this.scene.remove(e.ring, e.sparks);
        e.ring.material.dispose(); e.sparks.geometry.dispose(); e.sparks.material.dispose();
        return false;
      }
      e.ring.scale.setScalar(1 + t * 4);
      e.ring.material.opacity = 0.9 * (1 - t);
      e.sparks.position.y = t * 1.2;
      e.sparks.material.opacity = 1 - t;
      return true;
    });
  }
}
