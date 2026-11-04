'use strict';
/**
 * 메타버스 성당 서버: Express 정적 서빙 + WebSocket(/ws) 실시간 동기화.
 * 실행: PORT=3000 node server/index.js  (미사는 접속자가 있으면 10초 휴식 후 자동 진행·반복)
 */
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Room, LIMITS, cleanText } = require('./rooms');
const { MassController } = require('./mass');

const PORT = Number(process.env.PORT) || 3000;
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

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg, exceptId) => {
  const data = JSON.stringify(msg);
  for (const [id, ws] of sockets) if (id !== exceptId && ws.readyState === 1) ws.send(data);
};

const mass = new MassController((state) => broadcast({ t: 'mass', state }));

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
      mass.setOccupied(true); // 첫 접속자 → 10초 휴식 후 미사 시작
      send(ws, {
        t: 'welcome',
        id: me.id,
        players: [...room.players.values()].map((p) => room.publicPlayer(p)),
        mass: mass.snapshot(),
        booths: room.boothState(),
      });
      broadcast({ t: 'join', player: room.publicPlayer(me) }, me.id);
      return;
    }

    switch (msg.t) {
      case 'move':
        room.move(me.id, msg);
        break;

      case 'chat': {
        const now = Date.now();
        if (now - me.lastChat < LIMITS.CHAT_INTERVAL_MS) return;
        const text = cleanText(msg.text, LIMITS.CHAT_MAX);
        if (!text) return;
        me.lastChat = now;
        broadcast({ t: 'chat', id: me.id, name: me.name, text, ts: now });
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

      case 'gesture': {
        const r = room.gesture(me.id, msg);
        if (r.ok) broadcast(r.msg);
        else if (r.reason) send(ws, { t: 'notice', msg: r.reason });
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
    if (room.players.size === 0) mass.setOccupied(false); // 아무도 없으면 미사 정지
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
  if (process.env.MASS_SPEED) console.log(`   (테스트 배속 MASS_SPEED=${process.env.MASS_SPEED})`);
});

module.exports = { server };
