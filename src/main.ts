import './style.css';
import {
  REEL_STRIPS,
  PAYLINES,
  SYMBOLS,
  type LineWin,
  spinStops,
  evaluateWins,
  gridFromStops,
} from './game';

const STRIP_REPEAT = 10; // 回転アニメーションの余白として DOM 上でストリップを繰り返す回数
const BETS = [10, 20, 50, 100];
const START_CREDITS = 1000;
const STORAGE_KEY = 'slot-web:credits';

let credits = loadCredits();
let betIndex = 0;
let spinning = false;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="cabinet">
    <h1 class="title">🎰 SLOT WEB</h1>
    <div class="reels">
      ${REEL_STRIPS.map((_, r) => `<div class="reel"><div class="strip" id="strip-${r}"></div></div>`).join('')}
    </div>
    <div class="message" id="message">SPIN でスタート！</div>
    <div class="hud">
      <div class="stat">💰 <b id="credits"></b></div>
      <div class="stat bet-ctrl">
        <button class="bet-btn" id="bet-down" aria-label="ベットを下げる">−</button>
        <span>BET <b id="bet"></b></span>
        <button class="bet-btn" id="bet-up" aria-label="ベットを上げる">＋</button>
      </div>
      <div class="stat">WIN <b id="win">0</b></div>
    </div>
    <button class="spin" id="spin">SPIN</button>
    <button class="charge hidden" id="charge">💳 クレジットを追加</button>
    <table class="paytable">
      <caption>配当表（左から連続 = BET × 倍率）</caption>
      <thead>
        <tr><th></th><th>×3</th><th>×4</th><th>×5</th></tr>
      </thead>
      <tbody>
        ${Object.values(SYMBOLS)
          .map(
            (s) =>
              `<tr><td>${s.char}</td>${s.payouts.map((p) => `<td>×${p}</td>`).join('')}</tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>
`;

const stripEls = REEL_STRIPS.map((_, r) => document.querySelector<HTMLElement>(`#strip-${r}`)!);
const creditsEl = document.querySelector<HTMLElement>('#credits')!;
const betEl = document.querySelector<HTMLElement>('#bet')!;
const winEl = document.querySelector<HTMLElement>('#win')!;
const messageEl = document.querySelector<HTMLElement>('#message')!;
const spinBtn = document.querySelector<HTMLButtonElement>('#spin')!;
const chargeBtn = document.querySelector<HTMLButtonElement>('#charge')!;
const betDownBtn = document.querySelector<HTMLButtonElement>('#bet-down')!;
const betUpBtn = document.querySelector<HTMLButtonElement>('#bet-up')!;

// リールのセルを生成
REEL_STRIPS.forEach((strip, r) => {
  const cells: string[] = [];
  for (let i = 0; i < STRIP_REPEAT; i++) {
    for (const id of strip) {
      cells.push(`<div class="cell">${SYMBOLS[id].char}</div>`);
    }
  }
  stripEls[r].innerHTML = cells.join('');
});

// 1コマの高さ。CSS の --cell が唯一の定義元
let cellPx = readCellPx();
function readCellPx(): number {
  return parseFloat(getComputedStyle(stripEls[0]).getPropertyValue('--cell')) || 100;
}

// 各リールの現在の停止セル（DOM 上の絶対 index。窓の最上段に見えるセル）
const pos = spinStops();

function setTransform(r: number, cellIndex: number) {
  stripEls[r].style.transform = `translateY(${-cellIndex * cellPx}px)`;
}
pos.forEach((p, r) => setTransform(r, p));

window.addEventListener('resize', () => {
  if (spinning) return;
  cellPx = readCellPx();
  pos.forEach((p, r) => setTransform(r, p));
});

function setMessage(text: string) {
  messageEl.textContent = text;
}

function loadCredits(): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= 0 && localStorage.getItem(STORAGE_KEY) !== null) {
      return saved;
    }
  } catch {
    /* localStorage が使えない環境では初期値にフォールバック */
  }
  return START_CREDITS;
}

function saveCredits() {
  try {
    localStorage.setItem(STORAGE_KEY, String(credits));
  } catch {
    /* 保存できなくてもゲームは続行できる */
  }
}

function render() {
  creditsEl.textContent = String(credits);
  betEl.textContent = String(BETS[betIndex]);
  spinBtn.disabled = spinning || credits < BETS[betIndex];
  betDownBtn.disabled = spinning || betIndex === 0;
  betUpBtn.disabled = spinning || betIndex === BETS.length - 1;
  const broke = credits < Math.min(...BETS);
  chargeBtn.classList.toggle('hidden', spinning || !broke);
  if (!spinning && broke) {
    setMessage('💸 クレジットがありません。チャージしてください');
  }
}

function clearWinHighlights() {
  document.querySelectorAll('.cell.win').forEach((c) => c.classList.remove('win'));
}

function highlightWins(wins: LineWin[]) {
  for (const w of wins) {
    PAYLINES[w.line].forEach((row, reel) => {
      if (reel >= w.count) return; // 揃った左側のリールだけ光らせる
      const cell = stripEls[reel].children[pos[reel] + row];
      cell?.classList.add('win');
    });
  }
}

function spinReel(r: number, stop: number): Promise<void> {
  const len = REEL_STRIPS[r].length;
  const el = stripEls[r];
  const cur = pos[r] % len;
  const delta = (stop - cur + len) % len;
  const target = cur + delta + len * (3 + r); // 数周まわしてから止める。後のリールほど長く回る
  el.style.transition = 'none';
  setTransform(r, cur);
  void el.offsetHeight; // reflow でスナップを確定させてからアニメーション開始
  el.style.transition = `transform ${1.2 + r * 0.35}s cubic-bezier(0.12, 0.8, 0.25, 1.06)`;
  setTransform(r, target);
  return new Promise((resolve) => {
    el.addEventListener(
      'transitionend',
      () => {
        el.style.transition = 'none';
        pos[r] = target % len;
        setTransform(r, pos[r]);
        resolve();
      },
      { once: true },
    );
  });
}

function spin() {
  if (spinning) return;
  const bet = BETS[betIndex];
  if (credits < bet) {
    render();
    return;
  }
  spinning = true;
  credits -= bet;
  saveCredits();
  winEl.textContent = '0';
  clearWinHighlights();
  setMessage('🎲 回転中…');
  render();

  const stops = spinStops();
  Promise.all(stops.map((stop, r) => spinReel(r, stop))).then(() => {
    const wins = evaluateWins(gridFromStops(stops), bet);
    const total = wins.reduce((sum, w) => sum + w.payout, 0);
    if (total > 0) {
      credits += total;
      winEl.textContent = String(total);
      setMessage(`🎉 WIN! +${total}　${wins.map((w) => `${SYMBOLS[w.symbol].char}×${w.count}`).join(' ')}`);
      highlightWins(wins);
    } else {
      setMessage('😢 ハズレ… もう一回！');
    }
    saveCredits();
    spinning = false;
    render();
  });
}

spinBtn.addEventListener('click', spin);
chargeBtn.addEventListener('click', () => {
  credits = START_CREDITS;
  saveCredits();
  setMessage(`💳 ${START_CREDITS} クレジットをチャージしました！`);
  render();
});
betDownBtn.addEventListener('click', () => {
  betIndex = Math.max(0, betIndex - 1);
  render();
});
betUpBtn.addEventListener('click', () => {
  betIndex = Math.min(BETS.length - 1, betIndex + 1);
  render();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    spin();
  }
});

render();
