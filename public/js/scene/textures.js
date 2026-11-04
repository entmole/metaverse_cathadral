// 외부 이미지 없이 Canvas로 생성하는 절차적 텍스처 모음
import * as THREE from 'three';

function canvasTexture(w, h, draw, { repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  return tex;
}

// 결정적 의사난수(매 접속마다 같은 성당 모습 유지)
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** 대리석 체크 바닥 */
export function marbleFloor() {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(7);
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const light = (x + y) % 2 === 0;
      g.fillStyle = light ? '#cfc6b8' : '#5b4a3e';
      g.fillRect(x * s, y * s, s, s);
      // 대리석 결
      g.strokeStyle = light ? 'rgba(120,105,90,.25)' : 'rgba(200,180,160,.12)';
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(x * s + r() * s, y * s);
        g.bezierCurveTo(x * s + r() * s, y * s + s * .3, x * s + r() * s, y * s + s * .7, x * s + r() * s, y * s + s);
        g.lineWidth = 0.5 + r() * 1.5;
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(30,22,16,.6)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
  }, { repeat: [6, 14] });
}

/** 석조 벽(블록 줄눈) */
export function stoneWall(repeat = [4, 3]) {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#b9ab95'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * 32;
      for (let x = -64; x < w; x += 64) {
        const t = 170 + Math.floor(r() * 30);
        g.fillStyle = `rgb(${t},${t - 12},${t - 30})`;
        g.fillRect(x + off + 1, y * rh + 1, 62, rh - 2);
      }
    }
  }, { repeat });
}

/** 스테인드글라스: 납선으로 나뉜 색유리 + 중앙 원형 메달리온 */
export function stainedGlass(seed, { rose = false } = {}) {
  const palette = ['#1d4fa8', '#b8202a', '#e3a92b', '#2a7d4f', '#6a2f8f', '#1f86b8', '#d9622b', '#f2e3b3'];
  return canvasTexture(256, rose ? 256 : 512, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
    const pick = () => palette[Math.floor(r() * palette.length)];
    if (rose) {
      const cx = w / 2, cy = h / 2, R = w / 2 - 4;
      for (let ring = 4; ring >= 1; ring--) {
        const segs = ring * 6;
        for (let i = 0; i < segs; i++) {
          g.beginPath(); g.moveTo(cx, cy);
          g.arc(cx, cy, (R * ring) / 4, (i / segs) * Math.PI * 2, ((i + 1) / segs) * Math.PI * 2);
          g.closePath(); g.fillStyle = pick(); g.fill();
          g.strokeStyle = '#151010'; g.lineWidth = 3; g.stroke();
        }
      }
      g.beginPath(); g.arc(cx, cy, R / 6, 0, Math.PI * 2); g.fillStyle = '#f2d27a'; g.fill();
      return;
    }
    // 세로창: 격자 + 대각 분할
    const cols = 4, rows = 10, cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.fillStyle = pick(); g.fillRect(x * cw, y * ch, cw, ch);
      if (r() > 0.5) {
        g.beginPath(); g.moveTo(x * cw, y * ch); g.lineTo((x + 1) * cw, (y + 1) * ch); g.lineTo(x * cw, (y + 1) * ch); g.closePath();
        g.fillStyle = pick(); g.fill();
      }
    }
    // 메달리온(십자가)
    const my = h * 0.45;
    g.beginPath(); g.arc(w / 2, my, w * 0.32, 0, Math.PI * 2); g.fillStyle = '#f0dca4'; g.fill();
    g.fillStyle = '#9b1c22';
    g.fillRect(w / 2 - 8, my - 52, 16, 104);
    g.fillRect(w / 2 - 36, my - 22, 72, 16);
    // 납선
    g.strokeStyle = '#141010'; g.lineWidth = 4;
    for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, h); g.stroke(); }
    for (let i = 0; i <= rows; i++) { g.beginPath(); g.moveTo(0, i * ch); g.lineTo(w, i * ch); g.stroke(); }
    g.beginPath(); g.arc(w / 2, my, w * 0.32, 0, Math.PI * 2); g.stroke();
  });
}

/** 텍스트 라벨(이름표·말풍선) */
export function labelTexture(text, { font = 28, color = '#fff', bg = 'rgba(15,12,18,.72)', pad = 12 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const f = `600 ${font}px "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif`;
  g.font = f;
  const tw = Math.ceil(g.measureText(text).width);
  c.width = tw + pad * 2; c.height = font + pad * 2;
  g.font = f;
  g.fillStyle = bg;
  const rr = c.height / 2;
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, rr); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, c.width / 2, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: c.width / c.height };
}

// ───────── 블록형 사제 아바타 텍스처 (64×64 아틀라스, 직접 그린 픽셀) ─────────
// 각 부위는 일반적인 정육면체 전개도로 배치: [위][아래] / [오른쪽][앞][왼쪽][뒤]
export const SKIN_LAYOUT = {
  head:     { u: 0,  v: 0,  w: 8, h: 8,  d: 8 },
  chasuble: { u: 32, v: 0,  w: 9, h: 16, d: 5 }, // 제의(어깨~무릎)
  arm:      { u: 0,  v: 16, w: 4, h: 12, d: 4 },
  thigh:    { u: 16, v: 16, w: 4, h: 6,  d: 4 },
  shin:     { u: 16, v: 26, w: 4, h: 6,  d: 4 },
};

/** 전개도 안의 각 면 사각형(px) */
export function netFaces({ u, v, w, h, d }) {
  return {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h],
  };
}

/** 이름 등 문자열 → 결정적 정수 */
export function hashStr(s) {
  let x = 2166136261;
  for (const ch of String(s)) x = Math.imul(x ^ ch.codePointAt(0), 16777619);
  return x >>> 0;
}

export const SKIN_TONES = ['#f2cfae', '#e4b48e', '#c99168', '#a5714b', '#7a5034'];
export const HAIR_COLORS = ['#2a1c13', '#4a3121', '#6e4b2c', '#1b1b1d', '#8d8a86', '#dcd6ca'];
// 전례색 제의: 흰색·녹색·자색·홍색·금색 (+ 장식 색)
export const VESTMENTS = [
  { name: '백색', base: '#eee8da', orphrey: '#d4a73f' },
  { name: '녹색', base: '#2f7a45', orphrey: '#e3bf5a' },
  { name: '자색', base: '#5b3a87', orphrey: '#e3bf5a' },
  { name: '홍색', base: '#a8242c', orphrey: '#e3bf5a' },
  { name: '금색', base: '#c99a3a', orphrey: '#f4ecd8' },
];

/**
 * 사제복(장백의·제의·영대)을 입은 블록 아바타 텍스처
 * @param {{skin:string, hair:string, vest:{base:string, orphrey:string}, seed:number}} o
 */
export function priestSkin({ skin, hair, vest, seed }) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = rng(seed);
  // 픽셀마다 밝기를 살짝 흔들어 블록 질감 표현
  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (x) => Math.max(0, Math.min(255, Math.round(x * (1 + amt))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  const fill = ([x, y, w, h], color, jitter = 0.06) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      g.fillStyle = shade(color, (r() - 0.5) * jitter);
      g.fillRect(x + i, y + j, 1, 1);
    }
  };
  const px = (x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); };
  const ALB = '#f4f1ea';

  // ── 머리: 머리카락 + 얼굴 ──
  const H = netFaces(SKIN_LAYOUT.head);
  fill(H.top, hair);
  fill(H.bottom, skin);
  fill(H.back, hair);
  for (const side of [H.right, H.left]) { fill(side, skin); fill([side[0], side[1], 8, 3], hair); }
  fill(H.front, skin, 0.03);
  fill([H.front[0], H.front[1], 8, 2], hair);              // 앞머리
  const [fx, fy] = H.front;
  for (const [ex, pupil] of [[1, 2], [5, 5]]) {            // 눈(흰자+눈동자)
    px(fx + ex, fy + 4, '#ffffff'); px(fx + ex + 1, fy + 4, '#ffffff');
    px(fx + pupil, fy + 4, '#3a2a20');
  }
  px(fx + 3, fy + 6, shade(skin, -0.28)); px(fx + 4, fy + 6, shade(skin, -0.28)); // 입
  px(fx + 1, fy + 3, shade(hair, 0.1)); px(fx + 2, fy + 3, shade(hair, 0.1));       // 눈썹
  px(fx + 5, fy + 3, shade(hair, 0.1)); px(fx + 6, fy + 3, shade(hair, 0.1));

  // ── 제의: 전례색 + 금색 장식(앞 Y자, 뒤 십자) ──
  const C = netFaces(SKIN_LAYOUT.chasuble);
  for (const f of Object.values(C)) fill(f, vest.base, 0.08);
  const [cx, cy] = C.front;
  fill([cx, cy, 9, 1], vest.orphrey, 0.05);                // 목둘레
  for (let k = 0; k < 4; k++) { px(cx + k, cy + k, vest.orphrey); px(cx + 8 - k, cy + k, vest.orphrey); } // Y자 팔
  fill([cx + 3, cy + 3, 3, 13], vest.orphrey, 0.05);        // Y자 기둥
  const [bx, by] = C.back;
  fill([bx, by, 9, 1], vest.orphrey, 0.05);
  fill([bx + 3, by + 1, 3, 15], vest.orphrey, 0.05);        // 뒤 기둥
  fill([bx + 1, by + 4, 7, 2], vest.orphrey, 0.05);         // 뒤 십자 가로대
  fill([C.front[0], C.front[1] + 15, 9, 1], shade(vest.base, -0.2), 0); // 밑단
  fill([C.back[0], C.back[1] + 15, 9, 1], shade(vest.base, -0.2), 0);

  // ── 팔: 어깨는 제의, 아래는 장백의 소매, 끝은 손 ──
  const A = netFaces(SKIN_LAYOUT.arm);
  for (const k of ['right', 'front', 'left', 'back']) {
    const f = A[k];
    fill(f, ALB, 0.05);
    fill([f[0], f[1], f[2], 3], vest.base, 0.08);
    fill([f[0], f[1] + 10, f[2], 2], skin, 0.03);
  }
  fill(A.top, vest.base); fill(A.bottom, skin);

  // ── 허벅지: 장백의 + 앞면에 영대 끝(금색) ──
  const T = netFaces(SKIN_LAYOUT.thigh);
  for (const f of Object.values(T)) fill(f, ALB, 0.05);
  fill([T.front[0] + 1, T.front[1] + 3, 2, 3], vest.orphrey, 0.04);
  px(T.front[0] + 1, T.front[1] + 5, shade(vest.orphrey, -0.25)); // 영대 끝 술
  px(T.front[0] + 2, T.front[1] + 5, shade(vest.orphrey, -0.25));

  // ── 정강이: 장백의 + 검은 신발 ──
  const S = netFaces(SKIN_LAYOUT.shin);
  for (const k of ['right', 'front', 'left', 'back']) {
    const f = S[k];
    fill(f, ALB, 0.05);
    fill([f[0], f[1] + 5, f[2], 1], '#2a211c', 0.05);
  }
  fill(S.top, ALB); fill(S.bottom, '#2a211c');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;  // 픽셀을 또렷하게
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
