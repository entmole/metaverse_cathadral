'use strict';
/**
 * 메타버스 성당 서버: Express 정적 서빙 + WebSocket(/ws) 실시간 동기화.
 * 실행: MASS_HOST_KEY=비밀키 PORT=3000 node server/index.js
 */
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Room, LIMITS, cleanText } = require('./rooms');
const { MassController } = require('./mass');

const PORT = Number(process.env.PORT) || 3000;
// 진행자 키 미지정 시 실행마다 임의 생성 후 콘솔에 출력
const HOST_KEY = process.env.MASS_HOST_KEY || crypto.randomBytes(4).toString('hex');
const STATE_HZ = 10;

// ───────── HTTP ─────────
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});
app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_req, res) => res.json({ ok: true, players: room.players.size }));

const server = http.createServer(app);

// ───────── WebSocket ─────────
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const room = new Room();
/** @type {Map<string, import('ws')>} */
const sockets = new Map();
let hostId = null;

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg, exceptId) => {
  const data = JSON.stringify(msg);
  for (const [id, ws] of sockets) if (id !== exceptId && ws.readyState === 1) ws.send(data);
};

const mass = new MassController((state) => broadcast({ t: 'mass', state }));

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

wss.on('connection', (ws) => {
  let me = null; // join 이후 플레이어 객체
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    // 입장 전에는 join만 허용
    if (!me) {
      if (msg.t !== 'join') return;
      if (room.isFull) { send(ws, { t: 'error', code: 'full', msg: '성당이 가득 찼습니다. 잠시 후 다시 시도해 주십시오.' }); return ws.close(); }
      me = room.add(msg.name);
      sockets.set(me.id, ws);
      send(ws, {
        t: 'welcome',
        id: me.id,
        players: [...room.players.values()].map((p) => room.publicPlayer(p)),
        mass: mass.snapshot(),
        booths: room.boothState(),
        isHost: false,
      });
      broadcast({ t: 'join', player: room.publicPlayer(me) }, me.id);
      return;
    }

    const isHost = hostId === me.id;
    switch (msg.t) {
      case 'move':
        room.move(me.id, msg);
        break;

      case 'chat': {
        const now = Date.now();
        if (now - me.lastChat < LIMITS.CHAT_INTERVAL_MS) return;
        if (mass.silence && !isHost) return send(ws, { t: 'notice', msg: '침묵 중에는 채팅이 제한됩니다.' });
        const text = cleanText(msg.text, LIMITS.CHAT_MAX);
        if (!text) return;
        me.lastChat = now;
        broadcast({ t: 'chat', id: me.id, name: me.name, text, host: isHost, ts: now });
        break;
      }

      case 'respond': {
        // 임의 문구 방지: 현재 단계의 응답 목록 인덱스만 허용
        const now = Date.now();
        if (now - me.lastRespond < LIMITS.RESPOND_INTERVAL_MS) return;
        const text = mass.responseText(msg.idx);
        if (!text) return;
        me.lastRespond = now;
        broadcast({ t: 'respond', id: me.id, text });
        break;
      }

      case 'host': {
        if (!safeEqual(msg.key, HOST_KEY)) return send(ws, { t: 'host', ok: false, msg: '진행자 키가 올바르지 않습니다.' });
        const prev = hostId && sockets.get(hostId);
        hostId = me.id;
        if (prev) send(prev, { t: 'host', ok: false, msg: '다른 진행자가 권한을 넘겨받았습니다.' });
        send(ws, { t: 'host', ok: true });
        mass.takeHost();
        break;
      }

      case 'mass': {
        if (msg.action === 'startAuto') {
          if (hostId) return send(ws, { t: 'notice', msg: '진행자가 미사를 진행 중입니다.' });
          if (!mass.startAuto()) return send(ws, { t: 'notice', msg: '이미 미사가 진행 중입니다.' });
          return;
        }
        if (!isHost) return; // 이하 진행자 전용
        if (msg.action === 'next') mass.next();
        else if (msg.action === 'prev') mass.prev();
        else if (msg.action === 'reset') mass.reset();
        else if (msg.action === 'silence') mass.setSilence(!mass.silence);
        break;
      }

      case 'booth': {
        if (msg.action === 'enter') {
          const r = room.enterBooth(me.id, String(msg.id));
          send(ws, { t: 'boothResult', ok: r.ok, id: msg.id, msg: r.reason });
        } else if (msg.action === 'leave') {
          room.leaveBooth(me.id);
        }
        broadcast({ t: 'booths', booths: room.boothState() });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (!me) return;
    const hadBooth = !!me.inBooth;
    room.remove(me.id);
    sockets.delete(me.id);
    broadcast({ t: 'leave', id: me.id });
    if (hadBooth) broadcast({ t: 'booths', booths: room.boothState() });
    if (hostId === me.id) { hostId = null; mass.releaseHost(); }
  });
});

// 위치 동기화 브로드캐스트
setInterval(() => {
  if (sockets.size) broadcast({ t: 'state', p: room.compactState() });
}, 1000 / STATE_HZ);

// 끊긴 연결 정리(heartbeat)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`✝  메타버스 성당 서버: http://localhost:${PORT}`);
  console.log(process.env.MASS_HOST_KEY
    ? '   진행자 키: 환경변수 MASS_HOST_KEY 사용'
    : `   진행자 키(임시): ${HOST_KEY}  ← MASS_HOST_KEY 환경변수로 고정 가능`);
});

module.exports = { server };
