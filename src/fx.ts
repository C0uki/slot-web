/**
 * 見た目の演出（紙吹雪・カウントアップ・シェイク）。
 */

const CONFETTI_COLORS = ['#f5c542', '#ff6b8a', '#6bd5ff', '#7dff8a', '#c58aff', '#ffa94d'];

/** 画面全体に紙吹雪を降らせる */
export function confetti(layer: HTMLElement, count: number) {
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.setProperty('--drift', (Math.random() * 2 - 1).toFixed(2));
    const duration = 2 + Math.random() * 1.6;
    piece.style.animationDuration = `${duration.toFixed(2)}s`;
    piece.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
    piece.style.width = `${6 + Math.random() * 7}px`;
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), (duration + 1) * 1000);
  }
}

/** 数字を 0 から to までカウントアップ表示する */
export function countUp(el: HTMLElement, to: number, duration = 800) {
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = Math.round(to * eased).toLocaleString('ja-JP');
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** 要素を一瞬揺らす */
export function shake(el: HTMLElement) {
  el.classList.remove('shake');
  void el.offsetWidth; // アニメーションを再トリガーするための reflow
  el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}
