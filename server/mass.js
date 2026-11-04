'use strict';
/**
 * 미사 진행 상태 머신 (진행자 없이 자동 반복).
 *   idle(접속자 없음) → break(휴식 10초) → running(단계별 duration 자동 진행) → 마침 후 다시 break …
 * 서버가 현재 단계의 단일 원본(Single Source of Truth)을 보관한다.
 */
const fs = require('fs');
const path = require('path');

const ORDER_PATH = path.join(__dirname, '..', 'public', 'data', 'mass-order.json');
const order = JSON.parse(fs.readFileSync(ORDER_PATH, 'utf8'));
const STEPS = order.steps;

const BREAK_SEC = 10;
// 테스트 전용 배속(기본 1). 예: MASS_SPEED=5 → 10초 단계가 2초
const SPEED = Math.max(1, Number(process.env.MASS_SPEED) || 1);
const ms = (sec) => (sec * 1000) / SPEED;

class MassController {
  /** @param {(state:object)=>void} onChange 상태 변경 시 브로드캐스트 콜백 */
  constructor(onChange) {
    this.onChange = onChange;
    this.mode = 'idle';     // idle | break | running
    this.stepIndex = -1;    // -1: 미사 전(휴식 중)
    this.phaseStartedAt = 0;
    this.phaseMs = 0;       // 현재 단계(또는 휴식)의 길이
    this.massCount = 0;     // 서버 시작 후 시작된 미사 횟수
    this.timer = null;
  }

  get steps() { return STEPS; }

  snapshot() {
    const elapsed = Date.now() - this.phaseStartedAt;
    return {
      mode: this.mode,
      stepIndex: this.stepIndex,
      total: STEPS.length,
      massCount: this.massCount,
      // 클라이언트 시계 오차를 피하기 위해 절대시각 대신 남은 시간(ms) 전달
      leftMs: this.mode === 'idle' ? 0 : Math.max(0, this.phaseMs - elapsed),
      phaseMs: this.phaseMs,
    };
  }

  /** 응답 버튼 인덱스가 현재 단계에 유효한지 검증 후 문구 반환 */
  responseText(idx) {
    const step = this.mode === 'running' ? STEPS[this.stepIndex] : null;
    if (!step || !Number.isInteger(idx)) return null;
    return step.responses[idx] ?? null;
  }

  /** 접속자 수 변화에 맞춰 시작/정지 */
  setOccupied(occupied) {
    if (occupied && this.mode === 'idle') this.#startBreak();
    else if (!occupied && this.mode !== 'idle') this.#stop();
  }

  #startBreak() {
    this.mode = 'break';
    this.stepIndex = -1;
    this.#phase(ms(BREAK_SEC), () => { this.massCount++; this.#goTo(0); });
  }

  #goTo(i) {
    if (i >= STEPS.length) return this.#startBreak(); // 마침 → 휴식 → 다음 미사
    this.mode = 'running';
    this.stepIndex = i;
    this.#phase(ms(STEPS[i].duration), () => this.#goTo(i + 1));
  }

  #phase(durationMs, next) {
    clearTimeout(this.timer);
    this.phaseStartedAt = Date.now();
    this.phaseMs = durationMs;
    this.timer = setTimeout(next, durationMs);
    this.onChange(this.snapshot());
  }

  #stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.mode = 'idle';
    this.stepIndex = -1;
    this.phaseMs = 0;
    this.onChange(this.snapshot());
  }
}

module.exports = { MassController, STEPS, BREAK_SEC };
