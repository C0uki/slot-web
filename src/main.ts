import './style.css';
import {
  REEL_STRIPS,
  SYMBOLS,
  SCATTERS,
  type LineWin,
  type ScatterWin,
  type SymbolId,
  spinStops,
  evaluateWins,
  evaluateScatters,
  gridFromStops,
} from './game';
import { confetti, countUp, shake } from './fx';
import { sound } from './sound';

const BIG_WIN_MULT = 15; // BET の何倍で BIG WIN 演出にするか
const MEGA_WIN_MULT = 50;

const STRIP_REPEAT = 11; // 回転アニメーションの余白として DOM 上でストリップを繰り返す回数
const MIN_BET = 10;
const START_CREDITS = 1000;
const STORAGE_KEY = 'slot-web:credits';

let credits = loadCredits();
let bet = MIN_BET;
let spinning = false;

/**
 * ベットを 1-2-5 刻みで上下させる（10, 20, 50, 100, 200, 500, …）。
 * 上限なし。下限は MIN_BET。
 */
function stepBet(value: number, dir: 1 | -1): number {
  const seq = [1, 2, 5];
  const exp = Math.floor(Math.log10(value));
  const mantissa = Math.round(value / 10 ** exp);
  let i = seq.indexOf(mantissa) + dir;
  let e = exp;
  if (i < 0) {
    i = seq.length - 1;
    e--;
  } else if (i >= seq.length) {
    i = 0;
    e++;
  }
  return Math.max(MIN_BET, seq[i] * 10 ** e);
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="cabinet">
    <button class="sound-btn" id="sound" aria-label="サウンド切り替え"></button>
    <h1 class="title">🎰 SLOT WEB</h1>
    <div class="game">
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
    </div>
    <details class="paytable-box">
      <summary>📋 配当表を見る</summary>
      <table class="paytable">
      <caption>配当表（横・斜めに3個以上並べばOK = BET × 倍率）</caption>
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
        <tr class="pt-sub"><td colspan="4">✨ スキャッター（画面のどこでもOK）</td></tr>
        ${(Object.entries(SCATTERS) as [SymbolId, { count: number; payout: number }[]][])
          .map(
            ([id, tiers]) =>
              `<tr><td>${SYMBOLS[id].char}</td>${tiers
                .map((t) => `<td>${t.count}個 ×${t.payout}</td>`)
                .join('')}${'<td></td>'.repeat(3 - tiers.length)}</tr>`,
          )
          .join('')}
      </tbody>
      </table>
    </details>
  </div>
  <div class="confetti-layer" id="confetti"></div>
  <div class="bigwin hidden" id="bigwin">
    <div class="bigwin-text" id="bigwin-text">BIG WIN!</div>
    <div class="bigwin-amount" id="bigwin-amount"></div>
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
const paytableBox = document.querySelector<HTMLDetailsElement>('.paytable-box')!;
const cabinetEl = document.querySelector<HTMLElement>('.cabinet')!;
const soundBtn = document.querySelector<HTMLButtonElement>('#sound')!;
const confettiLayer = document.querySelector<HTMLElement>('#confetti')!;
const bigwinEl = document.querySelector<HTMLElement>('#bigwin')!;
const bigwinTextEl = document.querySelector<HTMLElement>('#bigwin-text')!;
const bigwinAmountEl = document.querySelector<HTMLElement>('#bigwin-amount')!;

// PCでは配当表を常時表示、スマホでは折りたたみ
const desktopMq = matchMedia('(min-width: 900px)');
function syncPaytableOpen() {
  paytableBox.open = desktopMq.matches;
}
syncPaytableOpen();
desktopMq.addEventListener('change', syncPaytableOpen);

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

// 1コマの高さ。CSS の --cell が唯一の定義元（calc/min を含むため実測で取得）
let cellPx = readCellPx();
function readCellPx(): number {
  return stripEls[0].children[0]?.getBoundingClientRect().height || 100;
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
  messageEl.classList.remove('pop');
  void messageEl.offsetWidth; // ポップアニメーションを再トリガー
  messageEl.classList.add('pop');
}

function showBigWin(label: string, amount: number) {
  bigwinTextEl.textContent = label;
  bigwinEl.classList.remove('hidden', 'out');
  countUp(bigwinAmountEl, amount, 1300);
  setTimeout(() => bigwinEl.classList.add('out'), 2700);
  setTimeout(() => bigwinEl.classList.add('hidden'), 3300);
}

function renderSoundBtn() {
  soundBtn.textContent = sound.muted ? '🔇' : '🔊';
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
  creditsEl.textContent = credits.toLocaleString('ja-JP');
  betEl.textContent = bet.toLocaleString('ja-JP');
  spinBtn.disabled = spinning || credits < bet;
  betDownBtn.disabled = spinning || bet <= MIN_BET;
  betUpBtn.disabled = spinning;
  const broke = credits < MIN_BET;
  chargeBtn.classList.toggle('hidden', spinning || !broke);
  if (!spinning && broke) {
    setMessage('💸 クレジットがありません。チャージしてください');
  } else if (!spinning && credits < bet) {
    setMessage(`💦 BET ${bet.toLocaleString('ja-JP')} にはクレジットが足りません`);
  }
}

function clearWinHighlights() {
  document
    .querySelectorAll('.cell.win, .cell.win-scatter')
    .forEach((c) => c.classList.remove('win', 'win-scatter'));
}

function highlightScatters(scatters: ScatterWin[], grid: SymbolId[][]) {
  for (const w of scatters) {
    grid.forEach((column, reel) => {
      column.forEach((symbol, row) => {
        if (symbol === w.symbol) {
          stripEls[reel].children[pos[reel] + row]?.classList.add('win-scatter');
        }
      });
    });
  }
}

function highlightWins(wins: LineWin[]) {
  for (const w of wins) {
    for (const [reel, row] of w.cells) {
      stripEls[reel].children[pos[reel] + row]?.classList.add('win');
    }
  }
}

function spinReel(r: number, stop: number, extraSec = 0): Promise<void> {
  const len = REEL_STRIPS[r].length;
  const el = stripEls[r];
  const reelEl = el.parentElement!;
  const cur = pos[r] % len;
  const delta = (stop - cur + len) % len;
  // 数周まわしてから止める。後のリールほど長く回り、リーチ時はさらに1周追加
  const target = cur + delta + len * (3 + r + (extraSec > 0 ? 1 : 0));
  el.style.transition = 'none';
  setTransform(r, cur);
  void el.offsetHeight; // reflow でスナップを確定させてからアニメーション開始
  el.style.transition = `transform ${1.2 + r * 0.35 + extraSec}s cubic-bezier(0.12, 0.8, 0.25, 1.06)`;
  setTransform(r, target);
  return new Promise((resolve) => {
    el.addEventListener(
      'transitionend',
      () => {
        el.style.transition = 'none';
        pos[r] = target % len;
        setTransform(r, pos[r]);
        sound.reelStop(r);
        reelEl.classList.add('stopped');
        setTimeout(() => reelEl.classList.remove('stopped'), 300);
        resolve();
      },
      { once: true },
    );
  });
}

function spin() {
  if (spinning) return;
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
  sound.spin();
  render();

  const stops = spinStops();
  const grid = gridFromStops(stops);

  // リーチ演出: 最後のリール以外に 7️⃣ が2個以上見えるなら、最後のリールを溜める
  const sevensBefore = grid
    .slice(0, -1)
    .flat()
    .filter((s) => s === 'seven').length;
  const anticipate = sevensBefore >= 2;
  const lastReelEl = stripEls[stripEls.length - 1].parentElement!;
  if (anticipate) {
    setTimeout(
      () => {
        lastReelEl.classList.add('anticipation');
        setMessage('🔥 リーチ…！');
        sound.reach();
      },
      (1.2 + (stripEls.length - 2) * 0.35 + 0.1) * 1000,
    );
  }

  Promise.all(
    stops.map((stop, r) =>
      spinReel(r, stop, anticipate && r === stripEls.length - 1 ? 1.4 : 0),
    ),
  ).then(() => {
    lastReelEl.classList.remove('anticipation');
    // 回転中に画面サイズが変わっていた場合に備えて位置を合わせ直す
    const measured = readCellPx();
    if (measured !== cellPx) {
      cellPx = measured;
      pos.forEach((p, r) => setTransform(r, p));
    }
    const wins = evaluateWins(grid, bet);
    const scatters = evaluateScatters(grid, bet);
    const total =
      wins.reduce((sum, w) => sum + w.payout, 0) +
      scatters.reduce((sum, w) => sum + w.payout, 0);
    if (total > 0) {
      credits += total;
      countUp(winEl, total, 800);
      const parts = [
        ...wins.map((w) => `${SYMBOLS[w.symbol].char}×${w.count}`),
        ...scatters.map((w) => `✨${SYMBOLS[w.symbol].char}×${w.count}`),
      ];
      setMessage(`🎉 WIN! +${total.toLocaleString('ja-JP')}　${parts.join(' ')}`);
      highlightWins(wins);
      highlightScatters(scatters, grid);
      const mult = total / bet;
      if (mult >= MEGA_WIN_MULT) {
        showBigWin('MEGA WIN!!', total);
        confetti(confettiLayer, 180);
        shake(cabinetEl);
        sound.bigWin();
      } else if (mult >= BIG_WIN_MULT) {
        showBigWin('BIG WIN!', total);
        confetti(confettiLayer, 100);
        shake(cabinetEl);
        sound.bigWin();
      } else if (scatters.length > 0) {
        sound.scatter();
      } else {
        sound.win();
      }
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
function changeBet(dir: 1 | -1) {
  if (spinning) return;
  bet = stepBet(bet, dir);
  render();
}

/** ボタン長押しで連続してベットを変更できるようにする */
function addHoldRepeat(btn: HTMLButtonElement, fn: () => void) {
  let delayTimer: number | undefined;
  let repeatTimer: number | undefined;
  const stop = () => {
    clearTimeout(delayTimer);
    clearInterval(repeatTimer);
  };
  btn.addEventListener('pointerdown', () => {
    delayTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(() => {
        if (!btn.disabled) fn();
      }, 110);
    }, 400);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
    btn.addEventListener(ev, stop);
  }
}

betDownBtn.addEventListener('click', () => changeBet(-1));
betUpBtn.addEventListener('click', () => changeBet(1));
addHoldRepeat(betDownBtn, () => changeBet(-1));
addHoldRepeat(betUpBtn, () => changeBet(1));
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    spin();
  }
});
soundBtn.addEventListener('click', () => {
  sound.toggle();
  renderSoundBtn();
});

render();
renderSoundBtn();

// 演出プレビュー用の隠しモード（?demo=bigwin で開くとビッグウィン演出を再生）
if (new URLSearchParams(location.search).get('demo') === 'bigwin') {
  showBigWin('BIG WIN!', 12345);
  confetti(confettiLayer, 120);
  shake(cabinetEl);
}
