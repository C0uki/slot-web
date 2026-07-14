/**
 * WebAudio で合成する効果音。音声ファイル不要。
 * AudioContext はユーザー操作後に遅延生成する（自動再生制限対策）。
 */

const MUTE_KEY = 'slot-web:muted';

let ctx: AudioContext | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function audioCtx(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  delay: number,
  dur: number,
  type: OscillatorType = 'square',
  vol = 0.15,
) {
  if (muted) return;
  try {
    const a = audioCtx();
    const osc = a.createOscillator();
    const gain = a.createGain();
    const t = a.currentTime + delay;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* 音が出せない環境では無視 */
  }
}

export const sound = {
  get muted() {
    return muted;
  },
  toggle(): boolean {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* 保存できなくても続行 */
    }
    return muted;
  },
  spin() {
    tone(200, 0, 0.08, 'square', 0.1);
    tone(300, 0.07, 0.08, 'square', 0.1);
  },
  reelStop(i: number) {
    tone(180 + i * 60, 0, 0.07, 'square', 0.12);
  },
  /** リーチ成立の瞬間の「ピキーン」 */
  reachFlash() {
    tone(1568, 0, 0.09, 'sine', 0.16);
    tone(2093, 0.06, 0.2, 'sine', 0.13);
  },
  reach() {
    tone(440, 0, 0.28, 'sawtooth', 0.07);
    tone(466, 0.3, 0.28, 'sawtooth', 0.07);
    tone(494, 0.6, 0.34, 'sawtooth', 0.08);
  },
  win() {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.16, 'triangle', 0.18));
  },
  scatter() {
    [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.12, 'sine', 0.14));
  },
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.22, 0.4, 'sawtooth', 0.12));
  },
  bigWin() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      tone(f, i * 0.13, 0.24, 'triangle', 0.2),
    );
  },
};
