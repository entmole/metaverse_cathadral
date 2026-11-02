'use strict';
/**
 * 미사 진행 상태 머신.
 * - 서버가 현재 단계의 단일 원본(Single Source of Truth)을 보관한다.
 * - 진행자(host)가 있으면 수동 진행, 없으면 각 단계 duration 기준 자동 진행.
 */
const fs = require('fs');
const path = require('path');

const ORDER_PATH = path.join(__dirname, '..', 'public', 'data', 'mass-order.json');
const order = JSON.parse(fs.readFileSync(ORDER_PATH, 'utf8'));
const STEPS = order.steps;

class MassController {
  /** @param {(state:object)=>void} onChange 상태 변경 시 브로드캐스트 콜백 */
  constructor(onChange) {
    this.onChange = onChange;
    this.stepIndex = -1;      // -1: 미사 시작 전
    this.mode = 'idle';       // idle | auto | host
    this.silence = false;     // 침묵 모드(채팅 제한)
    this.stepStartedAt = 0;
    this.timer = null;
  }

  get steps() { return STEPS; }

  snapshot() {
    const step = STEPS[this.stepIndex];
    return {
      stepIndex: this.stepIndex,
      total: STEPS.length,
      mode: this.mode,
      silence: this.silence,
      // 클라이언트 시계 오차를 피하기 위해 절대시각 대신 경과 시간(ms) 전달
      elapsedMs: this.stepIndex >= 0 ? Date.now() - this.stepStartedAt : 0,
      // 자동 진행일 때만 남은 시간 표시용 duration 전달
      duration: this.mode === 'auto' && step ? step.duration : null,
    };
  }

  /** 응답 버튼 인덱스가 현재 단계에 유효한지 검증 후 문구 반환 */
  responseText(idx) {
    const step = STEPS[this.stepIndex];
    if (!step || !Number.isInteger(idx)) return null;
    return step.responses[idx] ?? null;
  }

  startAuto() {
    if (this.mode !== 'idle') return false;
    this.mode = 'auto';
    this.goTo(0);
    return true;
  }

  /** 진행자 연결 시 수동 모드로 전환(자동 진행 중이면 현재 단계 유지) */
  takeHost() {
    this.mode = 'host';
    this.clearTimer();
    this.emit();
  }

  /** 진행자 이탈 시: 미사 중이면 자동 진행으로 넘김 */
  releaseHost() {
    if (this.mode !== 'host') return;
    if (this.stepIndex >= 0) {
      this.mode = 'auto';
      this.goTo(this.stepIndex);
    } else {
      this.mode = 'idle';
      this.emit();
    }
  }

  next() { return this.goTo(this.stepIndex + 1); }
  prev() { return this.goTo(Math.max(0, this.stepIndex - 1)); }

  goTo(i) {
    this.clearTimer();
    if (i >= STEPS.length) return this.reset();
    this.stepIndex = i;
    this.stepStartedAt = Date.now();
    if (this.mode === 'auto') {
      this.timer = setTimeout(() => this.next(), STEPS[i].duration * 1000);
    }
    this.emit();
    return true;
  }

  reset() {
    this.clearTimer();
    this.stepIndex = -1;
    this.silence = false;
    if (this.mode === 'auto') this.mode = 'idle';
    this.emit();
    return true;
  }

  setSilence(on) {
    this.silence = !!on;
    this.emit();
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  emit() { this.onChange(this.snapshot()); }
}

module.exports = { MassController, STEPS };
