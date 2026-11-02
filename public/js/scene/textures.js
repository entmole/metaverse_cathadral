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
