// 다른 접속자 아바타: 사제복을 입은 블록형 인물
// 생성·보간·자세(서기/앉기/무릎)·걷기·인사 동작·말풍선·선택(레이캐스트)
import * as THREE from 'three';
import {
  labelTexture, priestSkin, SKIN_LAYOUT, netFaces, hashStr, SKIN_TONES, HAIR_COLORS, VESTMENTS,
} from './textures.js';

const P = 0.056;            // 1픽셀 = 5.6cm → 키 32px ≈ 1.8m
const HIP = 12 * P;         // 엉덩이(다리 회전축) 높이
const POSE_FROM_CODE = ['stand', 'sit', 'kneel'];
// 자세별 몸 높이 오프셋(m)
const POSE_DY = { stand: 0, sit: -0.06, kneel: -(HIP - 8 * P) };
// 인사 동작: 길이(초)와 최대 숙임 각도(rad)
const GESTURE = { bow: { dur: 1.6, angle: 0.5 }, peace: { dur: 2.0, angle: 0.6 } };

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

/**
 * 전개도(64×64 아틀라스)에 맞춘 UV를 가진 상자
 * BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z  /  아바타 정면 = -z
 */
function skinBox(part) {
  const L = SKIN_LAYOUT[part];
  const geo = new THREE.BoxGeometry(L.w * P, L.h * P, L.d * P);
  const F = netFaces(L);
  // 정면(-z)을 바라볼 때 인물의 오른쪽 = +x
  const order = [F.right, F.left, F.top, F.bottom, F.back, F.front];
  const uv = geo.attributes.uv;
  order.forEach(([x, y, w, h], face) => {
    const u0 = x / 64, u1 = (x + w) / 64, vt = 1 - y / 64, vb = 1 - (y + h) / 64;
    const i = face * 4;
    uv.setXY(i, u0, vt); uv.setXY(i + 1, u1, vt); uv.setXY(i + 2, u0, vb); uv.setXY(i + 3, u1, vb);
  });
  uv.needsUpdate = true;
  return geo;
}

/** 회전축(pivot) 그룹 아래에 상자를 매달기: offsetY만큼 내려 위쪽 끝이 축에 오도록 */
function hang(geo, mat, offsetY) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = offsetY;
  pivot.add(mesh);
  return pivot;
}

const lerp = (a, b, k) => a + (b - a) * k;

export class AvatarManager {
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, any>} */
    this.items = new Map();
    this.geo = {
      head: skinBox('head'), chasuble: skinBox('chasuble'), arm: skinBox('arm'),
      thigh: skinBox('thigh'), shin: skinBox('shin'),
      ring: new THREE.RingGeometry(0.2, 0.32, 40),
      hitbox: new THREE.CylinderGeometry(0.5, 0.5, 1.9, 10), // 손가락으로 누르기 쉽게 넉넉한 선택 영역
    };
    this.hitMat = new THREE.MeshBasicMaterial({ visible: false }); // 화면에 그리지 않음
    /** 평화의 인사 빛 효과(바닥 금빛 고리 + 떠오르는 빛 알갱이) */
    this.effects = [];
  }

  /** 접속자마다 다른 외형(서버가 준 hue + 이름으로 결정 → 모든 화면에서 같은 모습) */
  #look(p) {
    const h = hashStr(p.name);
    return {
      skin: SKIN_TONES[h % SKIN_TONES.length],
      hair: HAIR_COLORS[(h >>> 4) % HAIR_COLORS.length],
      vest: VESTMENTS[Math.floor(((p.hue % 360) + 360) % 360 / 72)],
      seed: h,
    };
  }

  add(p) {
    if (this.items.has(p.id)) return;
    const look = this.#look(p);
    const tex = priestSkin(look);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });

    const g = new THREE.Group();
    const body = new THREE.Group();               // 자세 높이
    g.add(body);

    // 다리: 허벅지(엉덩이 축) → 정강이(무릎 축)
    const legs = [-1, 1].map((side) => {
      const thigh = hang(this.geo.thigh, mat, -3 * P);
      thigh.position.set(side * 2 * P, HIP, 0);
      const knee = hang(this.geo.shin, mat, -3 * P);
      knee.position.y = -6 * P;
      thigh.add(knee);
      body.add(thigh);
      return { thigh, knee };
    });

    // 상체(엉덩이 축으로 숙임): 제의(몸통) + 머리 + 팔
    const upper = new THREE.Group();
    upper.position.y = HIP;
    const chasuble = new THREE.Mesh(this.geo.chasuble, mat);
    chasuble.position.y = 4 * P;                  // 어깨(12px)~엉덩이 아래 4px
    const head = new THREE.Mesh(this.geo.head, mat);
    head.position.y = 16 * P;
    const arms = [-1, 1].map((side) => {
      const arm = hang(this.geo.arm, mat, -5 * P);
      arm.position.set(side * 6.5 * P, 11 * P, 0); // 어깨 축
      upper.add(arm);
      return arm;
    });
    upper.add(chasuble, head);
    body.add(upper);

    const hitbox = new THREE.Mesh(this.geo.hitbox, this.hitMat);
    hitbox.position.y = 0.95;
    hitbox.userData.avatarId = p.id;
    body.add(hitbox);

    const label = makeSprite(labelTexture(p.name, { font: 26 }), 0.22);
    label.position.y = 2.05;
    g.add(label);

    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.ry;
    g.visible = !p.hidden;
    this.scene.add(g);
    this.items.set(p.id, {
      g, body, upper, legs, arms, label, mat, tex, name: p.name, vest: look.vest.name, picks: [hitbox],
      target: new THREE.Vector3(p.x, p.y, p.z), ry: p.ry, pose: p.pose,
      last: new THREE.Vector3(p.x, p.y, p.z), speed: 0, walk: 0,
      bubble: null, bubbleUntil: 0,
      gesture: null, gestureStart: 0,
    });
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.scene.remove(it.g);
    it.mat.dispose(); it.tex.dispose();
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
    it.bubble.position.y = 2.38;
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

  /** 레이캐스터로 아바타 선택 → {id, distance} 또는 null */
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
    const kp = Math.min(1, dt * 8); // 팔다리 자세 전환 속도
    const now = performance.now();
    for (const it of this.items.values()) {
      it.g.position.lerp(it.target, k);
      // 각도 보간(최단 경로)
      let d = it.ry - it.g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      it.g.rotation.y += d * k;

      // 실제 움직인 속도 → 걷기 동작
      const moved = it.g.position.distanceTo(it.last) / Math.max(dt, 1e-3);
      it.last.copy(it.g.position);
      it.speed = lerp(it.speed, moved, Math.min(1, dt * 6));
      const walking = it.pose === 'stand' && it.speed > 0.25;
      it.walk += dt * Math.min(it.speed, 4) * 4;
      const swing = walking ? Math.sin(it.walk) * Math.min(1, it.speed / 2) * 0.7 : 0;

      // 인사 동작 진행
      let bow = 0;
      if (it.gesture) {
        const G = GESTURE[it.gesture];
        const t = (now - it.gestureStart) / 1000 / G.dur;
        bow = bowCurve(t) * G.angle;
        if (t >= 1) it.gesture = null;
      }
      const praying = !!it.gesture || it.pose === 'kneel'; // 두 손 모음

      // 몸 높이(자세)
      it.body.position.y = lerp(it.body.position.y, POSE_DY[it.pose] ?? 0, k);

      // 다리: +x 회전 = 아래쪽 끝이 앞(-z)으로
      const legT = { stand: [0, 0], sit: [Math.PI / 2, -Math.PI / 2], kneel: [0, -Math.PI / 2] }[it.pose] ?? [0, 0];
      it.legs.forEach(({ thigh, knee }, i) => {
        const s = i === 0 ? swing : -swing;
        thigh.rotation.x = lerp(thigh.rotation.x, legT[0] + s, kp);
        knee.rotation.x = lerp(knee.rotation.x, legT[1], kp);
      });

      // 팔: 걸을 때 다리와 반대로, 기도·인사 땐 가슴 앞에 모음
      it.arms.forEach((arm, i) => {
        const side = i === 0 ? -1 : 1; // -x(왼팔) / +x(오른팔)
        const tx = praying ? 1.05 : (i === 0 ? -swing : swing) * 0.8;
        const tz = praying ? -side * 0.42 : 0;
        arm.rotation.x = lerp(arm.rotation.x, tx, kp);
        arm.rotation.z = lerp(arm.rotation.z, tz, kp);
      });

      // 상체: 무릎 꿇을 때 살짝 숙임 + 인사(음수 = 앞으로 숙임)
      const tilt = it.pose === 'kneel' ? -0.12 : 0;
      it.upper.rotation.x = it.gesture ? tilt - bow : lerp(it.upper.rotation.x, tilt, k);

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
