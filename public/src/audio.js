// ============================================
// 8-bit 音频模块：Web Audio 合成，无需任何音频素材
// 悠闲轻快的芯片音乐 + 简单音效
// ============================================

const BPM = 104;                  // 悠闲的中速
const STEP = 60 / BPM / 2;        // 一个八分音符的时长（秒）
const STEPS_PER_BAR = 8;
const LOOKAHEAD = 0.15;           // 提前排程的秒数
const TICK_MS = 40;               // 排程器轮询间隔

// 和弦进行：C - Am - F - G（大调，听感轻松）
// root 用低音区，tones 用于分解和弦
const PROGRESSION = [
  { root: 48, tones: [60, 64, 67] },   // C
  { root: 45, tones: [57, 60, 64] },   // Am
  { root: 41, tones: [53, 57, 60] },   // F
  { root: 43, tones: [55, 59, 62] },   // G
];

// 主旋律：每小节 8 个八分音符步，null 表示休止
const MELODY = [
  [64, null, 67, null, 72, null, 71, 67],   // C
  [69, null, 72, null, 76, null, 74, 72],   // Am
  [65, null, 69, null, 72, null, 74, 72],   // F
  [67, null, 71, null, 74, null, 76, 74],   // G
  [72, null, 71, null, 67, null, 64, 67],   // C
  [69, null, 72, null, 76, null, 72, 69],   // Am
  [65, null, 69, null, 72, null, 74, 76],   // F
  [74, null, 71, 69, 67, null, null, null], // G（末句留白，循环回开头）
];

const TOTAL_STEPS = MELODY.length * STEPS_PER_BAR;

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio8bit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuf = null;
    this.musicWanted = false;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this._unlockInstalled = false;

    this.muted = false;
    try { this.muted = localStorage.getItem('greens_muted') === '1'; } catch (e) { /* 隐私模式忽略 */ }
  }

  // ===== 生命周期 =====
  // 浏览器要求用户手势后才能出声：第一次点击/按键时创建并恢复 AudioContext
  installUnlock() {
    if (this._unlockInstalled) return;
    this._unlockInstalled = true;
    const unlock = () => {
      this._ensure();
      if (this.musicWanted) this._startSequencer();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.3;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.55;
      this.sfxBus.connect(this.master);

      // 白噪声缓冲：打击乐与部分音效共用
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  isMuted() { return this.muted; }

  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem('greens_muted', this.muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    if (!this.muted) this.sfx('click');
    return this.muted;
  }

  startMusic() {
    this.musicWanted = true;
    this._ensure();
    if (this.ctx) this._startSequencer();
  }

  stopMusic() {
    this.musicWanted = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  _startSequencer() {
    if (this.timer || !this.ctx) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._scheduler(), TICK_MS);
  }

  _scheduler() {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this._playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  }

  // ===== 音乐声部 =====
  _playStep(step, time) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const idx = step % STEPS_PER_BAR;
    const chord = PROGRESSION[bar % PROGRESSION.length];

    // 主旋律：方波，柔和包络
    const note = MELODY[bar % MELODY.length][idx];
    if (note !== null && note !== undefined) {
      this._tone(midiToFreq(note), time, STEP * 1.7, 'square', 0.16, this.musicBus);
    }

    // 低音：三角波，每拍交替根音/五度
    if (idx % 2 === 0) {
      const useFifth = idx === 2 || idx === 6;
      this._tone(midiToFreq(chord.root + (useFifth ? 7 : 0)), time, STEP * 1.8, 'triangle', 0.22, this.musicBus);
    }

    // 分解和弦：极轻的芯片垫音
    this._tone(midiToFreq(chord.tones[idx % 3]), time, STEP * 0.5, 'square', 0.035, this.musicBus);

    // 节奏：反拍轻踩镲 + 一三拍底鼓
    if (idx % 2 === 1) this._noise(time, 0.03, 0.05, 'highpass', 6000, 6000, this.musicBus);
    if (idx === 0 || idx === 4) this._kick(time, 0.22, this.musicBus);
  }

  // ===== 基础发声单元 =====
  _tone(freq, time, dur, type, vol, bus) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(bus || this.sfxBus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  // 频率滑动的音（音效主力）
  _sweep(f0, f1, time, dur, type, vol, bus) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(bus || this.sfxBus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _noise(time, dur, vol, filterType, f0, f1, bus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType || 'lowpass';
    filt.frequency.setValueAtTime(f0, time);
    if (f1 && f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), time + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus || this.sfxBus);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  _kick(time, vol, bus) {
    this._sweep(130, 45, time, 0.13, 'sine', vol, bus || this.musicBus);
  }

  // ===== 音效 =====
  // vol 可选：AI 的动作可以用更小的音量，避免喧宾夺主
  sfx(name, vol = 1) {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + 0.001;
    const bus = this.sfxBus;
    const v = (x) => x * vol;

    switch (name) {
      case 'click':
        this._tone(880, t, 0.05, 'square', v(0.22), bus);
        break;
      case 'deny':
        this._sweep(220, 130, t, 0.18, 'square', v(0.3), bus);
        break;
      case 'buy':
        this._tone(660, t, 0.06, 'square', v(0.3), bus);
        this._tone(990, t + 0.07, 0.09, 'square', v(0.3), bus);
        break;
      case 'till':
        this._noise(t, 0.16, v(0.4), 'lowpass', 900, 180, bus);
        this._sweep(180, 90, t, 0.12, 'triangle', v(0.25), bus);
        break;
      case 'plant':
        this._sweep(520, 820, t, 0.1, 'square', v(0.32), bus);
        break;
      case 'water':
        this._tone(760, t, 0.06, 'sine', v(0.28), bus);
        this._tone(1020, t + 0.07, 0.06, 'sine', v(0.26), bus);
        this._tone(1320, t + 0.14, 0.08, 'sine', v(0.22), bus);
        break;
      case 'harvest':
        this._tone(1046, t, 0.07, 'square', v(0.3), bus);
        this._tone(1318, t + 0.06, 0.07, 'square', v(0.3), bus);
        this._tone(1568, t + 0.12, 0.12, 'square', v(0.3), bus);
        break;
      case 'throw':
        this._noise(t, 0.13, v(0.26), 'bandpass', 500, 2200, bus);
        break;
      case 'hit':
        this._sweep(200, 80, t, 0.14, 'square', v(0.4), bus);
        this._noise(t, 0.08, v(0.3), 'lowpass', 1400, 300, bus);
        break;
      case 'hurt':
        this._sweep(440, 300, t, 0.16, 'square', v(0.36), bus);
        break;
      case 'smash':
        this._noise(t, 0.12, v(0.34), 'lowpass', 1200, 200, bus);
        this._sweep(150, 70, t, 0.1, 'square', v(0.25), bus);
        break;
      case 'revert':
        this._sweep(300, 120, t, 0.22, 'sine', v(0.26), bus);
        this._noise(t, 0.18, v(0.18), 'lowpass', 700, 150, bus);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this._tone(f, t + i * 0.13, 0.2, 'square', v(0.32), bus));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this._tone(f, t + i * 0.18, 0.28, 'triangle', v(0.3), bus));
        break;
      default:
        break;
    }
  }
}

export const audio = new Audio8bit();