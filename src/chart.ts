/**
 * クレジット推移の折れ線グラフ（canvas描画・依存なし）。
 * ホバーでクロスヘアとツールチップを表示する。
 */

import type { SpinRecord } from './stats';

const LINE = '#f5c542';
const AREA = 'rgba(245, 197, 66, 0.12)';
const GRID = 'rgba(255, 255, 255, 0.10)';
const INK_MUTED = 'rgba(255, 255, 255, 0.5)';
const INK = 'rgba(255, 255, 255, 0.9)';
const SURFACE = '#1c1038';
const FONT = '11px system-ui, sans-serif';

/** ~4本のキリのいい目盛り間隔を選ぶ */
function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  for (const m of [1, 2, 5, 10]) {
    if (m * mag >= raw) return m * mag;
  }
  return 10 * mag;
}

export function renderCreditChart(
  canvas: HTMLCanvasElement,
  tooltip: HTMLElement,
  history: readonly SpinRecord[],
) {
  const cssW = canvas.parentElement!.clientWidth;
  const cssH = 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (history.length < 2) {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = INK_MUTED;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('まだデータがありません。スピンすると記録されます', cssW / 2, cssH / 2);
    canvas.onmousemove = null;
    canvas.onmouseleave = null;
    return;
  }

  const pad = { l: 10, r: 16, t: 14, b: 22 };
  const yMax = Math.max(...history.map((h) => h.credits)) * 1.08 || 1;
  const step = niceStep(yMax);
  const plotW = cssW - pad.l - pad.r;
  const plotH = cssH - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (history.length - 1)) * plotW;
  const y = (v: number) => pad.t + plotH - (v / yMax) * plotH;

  const draw = (hoverIndex: number) => {
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = FONT;

    // 目盛りとグリッド（控えめに）
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    for (let v = 0; v <= yMax; v += step) {
      const gy = y(v);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(cssW - pad.r, gy);
      ctx.stroke();
      if (v > 0) {
        ctx.fillStyle = INK_MUTED;
        ctx.fillText(v.toLocaleString('ja-JP'), pad.l + 2, gy - 2);
      }
    }
    // X軸ラベル（最初と最後だけ）
    ctx.fillStyle = INK_MUTED;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('1', pad.l, cssH - pad.b + 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${history.length}回`, cssW - pad.r, cssH - pad.b + 6);

    // 面（薄く）と折れ線
    ctx.beginPath();
    history.forEach((h, i) => (i === 0 ? ctx.moveTo(x(i), y(h.credits)) : ctx.lineTo(x(i), y(h.credits))));
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(x(history.length - 1), y(0));
    ctx.lineTo(x(0), y(0));
    ctx.closePath();
    ctx.fillStyle = AREA;
    ctx.fill();

    // 最終値の直接ラベル
    const last = history[history.length - 1];
    ctx.fillStyle = LINE;
    ctx.beginPath();
    ctx.arc(x(history.length - 1), y(last.credits), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(last.credits.toLocaleString('ja-JP'), cssW - pad.r, y(last.credits) - 6);

    // ホバー中のクロスヘアとマーカー
    if (hoverIndex >= 0) {
      const h = history[hoverIndex];
      const hx = x(hoverIndex);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, pad.t);
      ctx.lineTo(hx, pad.t + plotH);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, y(h.credits), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = LINE;
      ctx.fill();
      ctx.strokeStyle = SURFACE;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  draw(-1);

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const i = Math.max(
      0,
      Math.min(history.length - 1, Math.round(((mx - pad.l) / plotW) * (history.length - 1))),
    );
    draw(i);
    const h = history[i];
    tooltip.textContent = `#${i + 1}　💰 ${h.credits.toLocaleString('ja-JP')}　BET ${h.bet.toLocaleString('ja-JP')}　WIN ${h.win.toLocaleString('ja-JP')}`;
    tooltip.classList.remove('hidden');
    const tipX = Math.min(Math.max(x(i) - 70, 0), cssW - 150);
    tooltip.style.left = `${tipX}px`;
    tooltip.style.top = `${Math.max(0, y(h.credits) - 34)}px`;
  };
  canvas.onmouseleave = () => {
    draw(-1);
    tooltip.classList.add('hidden');
  };
}
