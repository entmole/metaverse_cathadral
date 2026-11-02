// 절차적 성당 모델: 신랑(nave)·측랑·기둥·볼트 천장·신자석·제단·고해소·조명
import * as THREE from 'three';
import { marbleFloor, stoneWall, stainedGlass } from './textures.js';

/** 배치 상수 (단위: m, 제대 방향 = -Z) */
export const LAYOUT = {
  halfW: 12, front: -28, back: 30,
  naveHalf: 7, colH: 7, aisleCeil: 10, vaultBase: 13,
  columnsZ: [-16, -10, -4, 2, 8, 14, 20, 26],
  pewRows: Array.from({ length: 13 }, (_, i) => -14 + i * 2.4),
  pewBlocks: [[-6.2, -1.2], [1.2, 6.2]],
  sanctuaryZ: -18,
  booths: [
    { id: 'booth-left', x: -11.1, z: 14, side: -1 },
    { id: 'booth-right', x: 11.1, z: 14, side: 1 },
  ],
};

export function buildCathedral(scene) {
  const L = LAYOUT;
  const root = new THREE.Group();
  scene.add(root);
  /** @type {{minX:number,maxX:number,minZ:number,maxZ:number}[]} */
  const colliders = [];
  const addCollider = (cx, cz, w, d) => colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

  const depth = L.back - L.front;
  const midZ = (L.back + L.front) / 2;

  // ── 재질 ──
  const M = {
    floor: new THREE.MeshStandardMaterial({ map: marbleFloor(), roughness: 0.35, metalness: 0.05 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneWall([6, 3]), roughness: 0.9 }),
    stoneSmall: new THREE.MeshStandardMaterial({ map: stoneWall([2, 1]), roughness: 0.9 }),
    column: new THREE.MeshStandardMaterial({ color: 0xd8ccb6, roughness: 0.6 }),
    vault: new THREE.MeshStandardMaterial({ color: 0x2b3a66, roughness: 0.9, side: THREE.BackSide }),
    rib: new THREE.MeshStandardMaterial({ color: 0xc9a85c, roughness: 0.4, metalness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.65 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.7 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0x7a1f24, roughness: 0.95 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.25, metalness: 0.9 }),
    marble: new THREE.MeshStandardMaterial({ color: 0xeee6d8, roughness: 0.3 }),
    door: new THREE.MeshStandardMaterial({ color: 0x241509, roughness: 0.8 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x050304 }),
  };

  const box = (w, h, d, mat, x, y, z, parent = root) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ── 바닥 ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.halfW * 2, depth), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = midZ;
  root.add(floor);
  // 중앙 통로 카펫
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.8, L.back - L.sanctuaryZ - 1), new THREE.MeshStandardMaterial({ color: 0x6e1a1f, roughness: 1 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.01, (L.back + L.sanctuaryZ) / 2);
  root.add(carpet);

  // ── 외벽 ──
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, L.aisleCeil), M.stone);
    wall.position.set(s * L.halfW, L.aisleCeil / 2, midZ);
    wall.rotation.y = -s * Math.PI / 2;
    root.add(wall);
    // 측랑 천장
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L.halfW - L.naveHalf, depth), M.vault);
    ceil.material = new THREE.MeshStandardMaterial({ color: 0x3a3048, roughness: 1, side: THREE.DoubleSide });
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(s * (L.naveHalf + L.halfW) / 2, L.aisleCeil, midZ);
    root.add(ceil);
    // 고창층 벽 (아치 위)
    const clere = new THREE.Mesh(new THREE.PlaneGeometry(depth, L.vaultBase - L.colH - 3), M.stone);
    clere.material = M.stone.clone();
    clere.material.side = THREE.DoubleSide;
    clere.position.set(s * L.naveHalf, (L.colH + 3 + L.vaultBase) / 2, midZ);
    clere.rotation.y = Math.PI / 2;
    root.add(clere);
  }
  // 앞·뒤 벽
  const endWall = (z, face) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(L.halfW * 2, L.vaultBase + L.naveHalf + 1), M.stone);
    w.position.set(0, (L.vaultBase + L.naveHalf + 1) / 2, z);
    w.rotation.y = face;
    root.add(w);
  };
  endWall(L.front, 0);
  endWall(L.back, Math.PI);
  // 정문
  box(3.4, 5.2, 0.2, M.door, 0, 2.6, L.back - 0.1);
  box(3.8, 0.3, 0.4, M.gold, 0, 5.3, L.back - 0.2);

  // ── 볼트 천장 (반원통) + 갈빗대 ──
  const vaultGeo = new THREE.CylinderGeometry(L.naveHalf, L.naveHalf, depth, 32, 1, true, Math.PI / 2, Math.PI);
  const vault = new THREE.Mesh(vaultGeo, M.vault);
  vault.rotation.x = Math.PI / 2;
  vault.position.set(0, L.vaultBase, midZ);
  root.add(vault);
  for (const z of L.columnsZ) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(L.naveHalf - 0.05, 0.12, 6, 32, Math.PI), M.rib);
    rib.position.set(0, L.vaultBase, z);
    root.add(rib);
  }
  // 천장 별(파란 볼트에 금빛 점)
  const starGeo = new THREE.BufferGeometry();
  const stars = [];
  for (let i = 0; i < 500; i++) {
    const a = Math.random() * Math.PI;
    const r = L.naveHalf - 0.08;
    stars.push(Math.cos(a) * r, L.vaultBase + Math.sin(a) * r, L.front + Math.random() * depth);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  root.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xf3d58a, size: 0.07 })));

  // ── 기둥 + 아케이드 아치 ──
  const colGeo = new THREE.CylinderGeometry(0.45, 0.5, L.colH, 16);
  const capGeo = new THREE.BoxGeometry(1.2, 0.35, 1.2);
  for (const s of [-1, 1]) {
    for (const z of L.columnsZ) {
      const c = new THREE.Mesh(colGeo, M.column);
      c.position.set(s * L.naveHalf, L.colH / 2, z);
      root.add(c);
      const cap = new THREE.Mesh(capGeo, M.column);
      cap.position.set(s * L.naveHalf, L.colH, z);
      root.add(cap);
      box(1.1, 0.25, 1.1, M.column, s * L.naveHalf, 0.12, z);
      addCollider(s * L.naveHalf, z, 1.1, 1.1);
    }
    for (let i = 0; i < L.columnsZ.length - 1; i++) {
      const z0 = L.columnsZ[i], z1 = L.columnsZ[i + 1];
      const arch = new THREE.Mesh(new THREE.TorusGeometry((z1 - z0) / 2, 0.22, 8, 24, Math.PI), M.column);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(s * L.naveHalf, L.colH, (z0 + z1) / 2);
      root.add(arch);
    }
  }

  // ── 스테인드글라스 (발광 재질 → 실내조명 영향 없이 빛남) ──
  const windows = [];
  const glassMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  const archWindow = (w, h) => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h - w / 2);
    shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    shape.lineTo(-w / 2, 0);
    const geo = new THREE.ShapeGeometry(shape, 12);
    // UV 정규화
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
    return geo;
  };
  let seed = 100;
  for (const s of [-1, 1]) {
    for (let i = 0; i < L.columnsZ.length - 1; i++) {
      const z = (L.columnsZ[i] + L.columnsZ[i + 1]) / 2;
      // 측랑 창
      const win = new THREE.Mesh(archWindow(1.8, 5), glassMat(stainedGlass(seed++)));
      win.position.set(s * (L.halfW - 0.02), 2.6, z);
      win.rotation.y = -s * Math.PI / 2;
      root.add(win); windows.push(win);
      // 고창 창
      const cw = new THREE.Mesh(archWindow(1.4, 2.4), glassMat(stainedGlass(seed++)));
      cw.position.set(s * (L.naveHalf - 0.02), L.colH + 3.2, z);
      cw.rotation.y = -s * Math.PI / 2;
      root.add(cw); windows.push(cw);
    }
  }
  // 장미창 (정문 위 / 제단 위)
  const rose = (z, ry, y, r) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), glassMat(stainedGlass(seed++, { rose: true })));
    m.position.set(0, y, z); m.rotation.y = ry;
    root.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.1, 0.15, 8, 48), M.stoneSmall);
    ring.position.copy(m.position); ring.rotation.y = ry;
    root.add(ring);
  };
  rose(L.back - 0.03, Math.PI, 11, 3);
  rose(L.front + 0.03, 0, 15, 2.6);

  // ── 제단(sanctuary) ──
  const sanct = new THREE.Group();
  root.add(sanct);
  const sanctDepth = L.sanctuaryZ - L.front;
  box(L.naveHalf * 2, 0.6, sanctDepth, M.marble, 0, 0.3, (L.front + L.sanctuaryZ) / 2, sanct);
  box(L.naveHalf * 2, 0.3, 0.6, M.marble, 0, 0.15, L.sanctuaryZ + 0.3, sanct); // 계단
  addCollider(0, (L.front + L.sanctuaryZ) / 2 + 0.3, L.naveHalf * 2 + 0.4, sanctDepth + 0.6);
  // 영성체 난간
  for (const s of [-1, 1]) box(5, 0.9, 0.25, M.marble, s * 4, 0.45, L.sanctuaryZ + 0.9, sanct);
  addCollider(-4, L.sanctuaryZ + 0.9, 5, 0.4);
  addCollider(4, L.sanctuaryZ + 0.9, 5, 0.4);

  // 제대
  const altarZ = -22;
  box(3.2, 1.0, 1.3, M.marble, 0, 1.1, altarZ, sanct);
  box(3.4, 0.04, 1.45, M.cloth, 0, 1.62, altarZ, sanct);
  box(3.42, 0.3, 0.02, M.gold, 0, 1.45, altarZ + 0.73, sanct);
  // 감실
  box(1.1, 1.0, 0.7, M.gold, 0, 1.5, -26.6, sanct);
  box(1.5, 0.9, 0.9, M.marble, 0, 0.75, -26.6, sanct);
  // 독서대
  const ambo = box(0.9, 1.2, 0.6, M.wood, -4.6, 1.2, -19.3, sanct);
  box(1.0, 0.06, 0.7, M.gold, -4.6, 1.83, -19.3, sanct).rotation.x = -0.35;
  // 십자가
  const cross = new THREE.Group();
  box(0.35, 6, 0.25, M.darkWood, 0, 0, 0, cross);
  box(3, 0.35, 0.25, M.darkWood, 0, 1.4, 0, cross);
  box(0.12, 1.6, 0.1, M.gold, 0, 0.5, 0.18, cross);
  box(1.6, 0.12, 0.1, M.gold, 0, 1.4, 0.18, cross);
  cross.position.set(0, 7.2, L.front + 0.3);
  sanct.add(cross);

  // 촛불
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc56b, toneMapped: false });
  const candle = (x, y, z, h = 0.5) => {
    box(0.08, h, 0.08, M.cloth, x, y + h / 2, z, sanct);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), flameMat);
    f.scale.y = 1.8;
    f.position.set(x, y + h + 0.06, z);
    sanct.add(f);
    flames.push(f);
  };
  for (const x of [-1.2, -0.6, 0.6, 1.2]) candle(x, 1.64, altarZ - 0.4, x % 1 === 0 ? 0.45 : 0.55);
  for (const s of [-1, 1]) {
    box(0.2, 1.4, 0.2, M.gold, s * 2.6, 1.3, -20, sanct);
    candle(s * 2.6, 2.0, -20, 0.6);
  }
  // 성체등(감실 옆 붉은 등)
  const sanctLamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3b2e, toneMapped: false }));
  sanctLamp.position.set(1.3, 2.4, -26.2);
  sanct.add(sanctLamp);

  // ── 신자석 (InstancedMesh로 드로콜 최소화) ──
  const seats = [];
  const pewParts = [
    { geo: new THREE.BoxGeometry(5, 0.08, 0.48), mat: M.wood, off: [0, 0.46, 0] },          // 좌판
    { geo: new THREE.BoxGeometry(5, 0.75, 0.06), mat: M.wood, off: [0, 0.85, 0.27] },       // 등받이
    { geo: new THREE.BoxGeometry(5, 0.1, 0.22), mat: M.cushion, off: [0, 0.15, -0.6] },     // 무릎틀
    { geo: new THREE.BoxGeometry(5, 0.08, 0.25), mat: M.wood, off: [0, 0.95, -0.42] },      // 앞 선반(앞줄 등받이 대용)
  ];
  const endGeo = new THREE.BoxGeometry(0.08, 1.05, 0.95);
  const count = L.pewRows.length * L.pewBlocks.length;
  const inst = pewParts.map((p) => new THREE.InstancedMesh(p.geo, p.mat, count));
  const ends = new THREE.InstancedMesh(endGeo, M.darkWood, count * 2);
  const mtx = new THREE.Matrix4();
  let k = 0;
  for (const z of L.pewRows) {
    for (const [x0, x1] of L.pewBlocks) {
      const cx = (x0 + x1) / 2;
      pewParts.forEach((p, i) => { mtx.makeTranslation(cx + p.off[0], p.off[1], z + p.off[2]); inst[i].setMatrixAt(k, mtx); });
      mtx.makeTranslation(x0, 0.52, z - 0.1); ends.setMatrixAt(k * 2, mtx);
      mtx.makeTranslation(x1, 0.52, z - 0.1); ends.setMatrixAt(k * 2 + 1, mtx);
      addCollider(cx, z - 0.15, x1 - x0, 1.0);
      for (let sx = x0 + 0.5; sx <= x1 - 0.4; sx += 0.9) seats.push({ x: sx, z: z - 0.05, row: z });
      k++;
    }
  }
  inst.forEach((m) => root.add(m));
  root.add(ends);

  // ── 고해소 ──
  const booths = L.booths.map((b) => {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    root.add(g);
    const W = 1.5, D = 2.6, H = 2.8; // W: x방향 깊이, D: z방향 폭
    box(W, H, 0.1, M.darkWood, 0, H / 2, -D / 2, g);
    box(W, H, 0.1, M.darkWood, 0, H / 2, D / 2, g);
    box(0.1, H, D, M.darkWood, b.side * W / 2, H / 2, 0, g);
    box(W + 0.2, 0.2, D + 0.2, M.wood, 0, H + 0.1, 0, g);
    // 정면(신랑 쪽) 기둥 + 커튼
    const frontX = -b.side * W / 2;
    box(0.12, H, 0.3, M.wood, frontX, H / 2, -D / 2 + 0.15, g);
    box(0.12, H, 0.3, M.wood, frontX, H / 2, D / 2 - 0.15, g);
    box(0.12, 0.35, D, M.wood, frontX, H - 0.18, 0, g);
    const curtain = box(0.04, H - 0.5, D - 0.6, new THREE.MeshStandardMaterial({ color: 0x4b1420, roughness: 1 }), frontX, (H - 0.5) / 2 + 0.05, 0, g);
    // 지붕 십자가
    box(0.08, 0.6, 0.08, M.gold, 0, H + 0.5, 0, g);
    box(0.32, 0.08, 0.08, M.gold, 0, H + 0.6, 0, g);
    // 사용 여부 표시등
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshBasicMaterial({ color: 0x55dd88, toneMapped: false }));
    lamp.position.set(frontX - b.side * 0.08, H - 0.55, 0);
    g.add(lamp);
    addCollider(b.x, b.z, W + 0.3, D + 0.3);
    return { id: b.id, entry: { x: b.x - b.side * 1.6, z: b.z }, lamp, curtain };
  });

  // ── 조명 ──
  scene.fog = new THREE.FogExp2(0x120d0c, 0.012);
  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x2a1d18, 0.6);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffe7c4, 0.25);
  scene.add(ambient);

  const chandeliers = [];
  for (const z of [20, 6, -8]) {
    const pl = new THREE.PointLight(0xffc98a, 60, 0, 1.6);
    pl.position.set(0, 8.5, z);
    scene.add(pl);
    // 샹들리에 형상
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 24), M.gold);
    ring.rotation.x = Math.PI / 2; ring.position.copy(pl.position);
    root.add(ring);
    const chain = box(0.03, L.vaultBase + L.naveHalf - 8.5, 0.03, M.gold, 0, (8.5 + L.vaultBase + L.naveHalf) / 2, z);
    chain.material = M.gold;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), flameMat);
      f.position.set(Math.cos(a) * 0.9, 8.6, z + Math.sin(a) * 0.9);
      root.add(f);
    }
    chandeliers.push(pl);
  }
  const altarSpot = new THREE.SpotLight(0xfff0d2, 120, 0, Math.PI / 7, 0.5, 1.4);
  altarSpot.position.set(0, 11, -16);
  altarSpot.target.position.set(0, 1.2, altarZ);
  scene.add(altarSpot, altarSpot.target);
  const amboSpot = new THREE.SpotLight(0xfff3dc, 0, 0, Math.PI / 12, 0.6, 1.4);
  amboSpot.position.set(-3, 10, -14);
  amboSpot.target = ambo;
  scene.add(amboSpot);
  const candleLight = new THREE.PointLight(0xffa850, 8, 8, 2);
  candleLight.position.set(0, 2.4, altarZ - 0.3);
  scene.add(candleLight);
  const crossLight = new THREE.SpotLight(0xffe4b0, 60, 0, Math.PI / 10, 0.5, 1.2);
  crossLight.position.set(0, 2, -21);
  crossLight.target = cross;
  scene.add(crossLight);

  // 조명 프리셋 (미사 단계별 분위기)
  const PRESETS = {
    normal:       { chand: 60, hemi: 0.6, altar: 120, ambo: 0,   cross: 60 },
    dim:          { chand: 22, hemi: 0.35, altar: 80,  ambo: 0,   cross: 70 },
    bright:       { chand: 95, hemi: 0.8, altar: 160, ambo: 0,   cross: 70 },
    word:         { chand: 40, hemi: 0.45, altar: 70,  ambo: 140, cross: 50 },
    altar:        { chand: 40, hemi: 0.45, altar: 220, ambo: 0,   cross: 80 },
    consecration: { chand: 14, hemi: 0.25, altar: 320, ambo: 0,   cross: 110 },
  };
  let target = PRESETS.normal;
  const setLightMode = (mode) => { target = PRESETS[mode] || PRESETS.normal; };

  // ── 먼지 입자(빛 속 부유) ──
  const dustN = 600;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 14;
    dustPos[i * 3 + 1] = Math.random() * 10;
    dustPos[i * 3 + 2] = L.front + 4 + Math.random() * (depth - 4);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe2a8, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false }));
  root.add(dust);

  const lerp = (a, b, t) => a + (b - a) * t;
  function update(t, dt) {
    const k = Math.min(1, dt * 1.5);
    for (const c of chandeliers) c.intensity = lerp(c.intensity, target.chand, k);
    hemi.intensity = lerp(hemi.intensity, target.hemi, k);
    altarSpot.intensity = lerp(altarSpot.intensity, target.altar, k);
    amboSpot.intensity = lerp(amboSpot.intensity, target.ambo, k);
    crossLight.intensity = lerp(crossLight.intensity, target.cross, k);
    // 촛불 흔들림
    candleLight.intensity = 7 + Math.sin(t * 9.1) * 0.8 + Math.sin(t * 23.7) * 0.5;
    flames.forEach((f, i) => { f.scale.y = 1.7 + Math.sin(t * 12 + i * 1.7) * 0.2; });
    dust.rotation.y = Math.sin(t * 0.03) * 0.05;
    dust.position.y = Math.sin(t * 0.2) * 0.15;
  }

  function setBoothBusy(id, busy) {
    const b = booths.find((x) => x.id === id);
    if (b) b.lamp.material.color.set(busy ? 0xff4a3d : 0x55dd88);
  }

  return { colliders, seats, booths, update, setLightMode, setBoothBusy, windows };
}
