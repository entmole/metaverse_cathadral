'use strict';
/**
 * 접속자(presence)·고해소 점유·입력 검증 유틸리티.
 * 고해 성찰 내용은 서버로 전송되지 않으며, 여기서는 "점유 여부"만 관리한다.
 */

const LIMITS = {
  MAX_PLAYERS: 60,
  NAME_MAX: 16,
  CHAT_MAX: 200,
  CHAT_INTERVAL_MS: 1000,   // 채팅 최소 간격
  RESPOND_INTERVAL_MS: 1500,
  MOVE_INTERVAL_MS: 40,     // 이동 패킷 최대 25Hz
  WORLD: { minX: -11.4, maxX: 11.4, minZ: -27, maxZ: 29 },
};

const POSES = new Set(['stand', 'sit', 'kneel']);
const BOOTH_IDS = ['booth-left', 'booth-right'];

/** 제어문자 제거 + 공백 정리 + 길이 제한 */
function cleanText(raw, max) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

class Room {
  constructor() {
    /** @type {Map<string, object>} */
    this.players = new Map();
    /** @type {Map<string, string|null>} boothId → playerId */
    this.booths = new Map(BOOTH_IDS.map((id) => [id, null]));
    this.seq = 0;
  }

  get isFull() { return this.players.size >= LIMITS.MAX_PLAYERS; }

  add(name) {
    const id = `p${(++this.seq).toString(36)}`;
    const player = {
      id,
      name: cleanText(name, LIMITS.NAME_MAX) || `순례자${this.seq}`,
      hue: Math.floor(Math.random() * 360),
      x: (Math.random() - 0.5) * 3, y: 0, z: 26, ry: 0,
      pose: 'stand',
      inBooth: null,
      lastMove: 0, lastChat: 0, lastRespond: 0,
    };
    this.players.set(id, player);
    return player;
  }

  remove(id) {
    this.leaveBooth(id);
    this.players.delete(id);
  }

  /** 이동 패킷 검증·반영. 월드 경계 밖 좌표는 보정 */
  move(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    const now = Date.now();
    if (now - p.lastMove < LIMITS.MOVE_INTERVAL_MS) return;
    p.lastMove = now;
    const W = LIMITS.WORLD;
    p.x = clamp(num(msg.x, p.x), W.minX, W.maxX);
    p.z = clamp(num(msg.z, p.z), W.minZ, W.maxZ);
    p.y = clamp(num(msg.y, p.y), 0, 1);
    p.ry = num(msg.ry, p.ry) % (Math.PI * 2);
    if (POSES.has(msg.pose)) p.pose = msg.pose;
  }

  enterBooth(id, boothId) {
    if (!this.booths.has(boothId)) return { ok: false, reason: '존재하지 않는 고해소입니다.' };
    const holder = this.booths.get(boothId);
    if (holder && holder !== id) return { ok: false, reason: '다른 분이 사용 중입니다. 잠시 기다려 주십시오.' };
    this.leaveBooth(id);
    this.booths.set(boothId, id);
    this.players.get(id).inBooth = boothId;
    return { ok: true };
  }

  leaveBooth(id) {
    const p = this.players.get(id);
    if (!p || !p.inBooth) return false;
    this.booths.set(p.inBooth, null);
    p.inBooth = null;
    return true;
  }

  /** 클라이언트 공개용: 누가 들어있는지는 숨기고 점유 여부만 전달 */
  boothState() {
    return Object.fromEntries([...this.booths].map(([k, v]) => [k, !!v]));
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, hue: p.hue, x: p.x, y: p.y, z: p.z, ry: p.ry, pose: p.pose, hidden: !!p.inBooth };
  }

  /** 10Hz 상태 동기화용 압축 배열: [id, x, y, z, ry, poseCode, hidden] */
  compactState() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return [...this.players.values()].map((p) => [
      p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.ry),
      p.pose === 'sit' ? 1 : p.pose === 'kneel' ? 2 : 0,
      p.inBooth ? 1 : 0,
    ]);
  }
}

module.exports = { Room, LIMITS, cleanText };
