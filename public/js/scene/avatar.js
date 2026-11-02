// 다른 접속자 아바타: 생성·보간·자세·말풍선
import * as THREE from 'three';
import { labelTexture } from './textures.js';

const POSE_FROM_CODE = ['stand', 'sit', 'kneel'];
// 자세별 몸통 높이 오프셋(m)과 기울기
const POSE_SHAPE = {
  stand: { dy: 0, tilt: 0 },
  sit: { dy: -0.42, tilt: 0 },
  kneel: { dy: -0.5, tilt: 0.12 },
};

function makeSprite({ tex, aspect }, height) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(height * aspect, height, 1);
  return sp;
}

export class AvatarManager {
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, any>} */
    this.items = new Map();
    this.bodyGeo = new THREE.CapsuleGeometry(0.26, 0.85, 4, 12);
    this.headGeo = new THREE.SphereGeometry(0.17, 16, 12);
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xe6c3a0, roughness: 0.7 });
  }

  add(p) {
    if (this.items.has(p.id)) return;
    const g = new THREE.Group();
    const robe = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(p.hue / 360, 0.35, 0.42), roughness: 0.85 });
    const body = new THREE.Mesh(this.bodyGeo, robe);
    body.position.y = 0.69;
    const head = new THREE.Mesh(this.headGeo, this.headMat);
    head.position.y = 1.45;
    const torso = new THREE.Group();
    torso.add(body, head);
    g.add(torso);
    const label = makeSprite(labelTexture(p.name, { font: 26 }), 0.22);
    label.position.y = 1.9;
    g.add(label);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.ry;
    g.visible = !p.hidden;
    this.scene.add(g);
    this.items.set(p.id, {
      g, torso, label, robe, name: p.name,
      target: new THREE.Vector3(p.x, p.y, p.z), ry: p.ry, pose: p.pose,
      bubble: null, bubbleUntil: 0,
    });
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.scene.remove(it.g);
    it.robe.dispose();
    it.label.material.map.dispose(); it.label.material.dispose();
    if (it.bubble) { it.bubble.material.map.dispose(); it.bubble.material.dispose(); }
    this.items.delete(id);
  }

  clear() { for (const id of [...this.items.keys()]) this.remove(id); }

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
    it.bubble.position.y = 2.25;
    it.g.add(it.bubble);
    it.bubbleUntil = performance.now() + 4000;
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
      it.torso.position.y += (shape.dy - it.torso.position.y) * k;
      it.torso.rotation.x += (-shape.tilt - it.torso.rotation.x) * k;
      if (it.bubble && now > it.bubbleUntil) {
        const m = it.bubble.material;
        m.opacity -= dt * 2;
        if (m.opacity <= 0) { it.g.remove(it.bubble); m.map.dispose(); m.dispose(); it.bubble = null; }
      }
    }
  }
}
