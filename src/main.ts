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
  findReachRuns,
  gridFromStops,
  type Cell,
} from './game';
import {
  CHARMS,
  computeMods,
  normaFor,
  pickShopCharms,
  spinsFor,
  type Charm,
  type Mods,
} from './charms';
import { confetti, countUp, shake } from './fx';
import { sound } from './sound';
import { loadStats, recordSpin, simulateOdds } from './stats';
import { renderCreditChart } from './chart';

const BIG_WIN_MULT = 15; // BET の何倍で BIG WIN 演出にするか
const MEGA_WIN_MULT = 50;

const STRIP_REPEAT = 11; // 回転アニメーションの余白として DOM 上でストリップを繰り返す回数
const MIN_BET = 10;
const START_CREDITS = 100;
const RUN_KEY = 'slot-web:run';

type Phase = 'playing' | 'shop' | 'gameover';

interface RunState {
  credits: number;
  round: number;
  spinsLeft: number;
  charms: string[];
}

let run: RunState = loadRun() ?? newRunState();
let credits = run.credits;
let mods: Mods = computeMods(run.charms);
let phase: Phase = 'playing';
let bet = MIN_BET;
let spinning = false;
let shopOffer: Charm[] = [];
const stats = loadStats();

function newRunState(): RunState {
  return { credits: START_CREDITS, round: 1, spinsLeft: 10, charms: [] };
}

function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as RunState;
    if (
      Number.isFinite(data.credits) &&
      Number.isFinite(data.round) &&
      Number.isFinite(data.spinsLeft) &&
      Array.isArray(data.charms) &&
      data.round >= 1 &&
      data.spinsLeft >= 0 &&
      data.credits >= 0
    ) {
      return data;
    }
  } catch {
    /* 壊れたセーブは無視して新規スタート */
  }
  return null;
}

function saveRun() {
  try {
    run.credits = credits;
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* 保存できなくてもゲームは続行できる */
  }
}

/** 現在のラウンドのノルマ */
function norma(): number {
  return normaFor(run.round);
}

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
    <button class="stats-btn" id="stats-open" aria-label="統計を見る">📊</button>
    <h1 class="title">🎰 SLOT WEB</h1>
    <div class="game">
      <div class="runbar">
        <div class="run-stat">ROUND <b id="round"></b></div>
        <div class="run-stat">💀 ノルマ <b id="norma"></b></div>
        <div class="run-stat">🎰 残り <b id="spins-left"></b>回</div>
      </div>
      <div class="norma-progress"><div class="norma-fill" id="norma-fill"></div></div>
      <div class="charms" id="charms"></div>
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
      </div>
      <button class="spin" id="spin">SPIN</button>
      <button class="pay hidden" id="pay">💀 ノルマを支払う</button>
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
  <div class="modal hidden" id="shop">
    <div class="modal-card">
      <h2>🛒 ショップ</h2>
      <p class="modal-sub">ノルマ達成！ お守りを買ってパワーアップしよう</p>
      <p class="shop-credits">💰 <b id="shop-credits"></b></p>
      <div class="shop-items" id="shop-items"></div>
      <button class="next-round" id="next-round">▶ 次のラウンドへ</button>
    </div>
  </div>
  <div class="modal hidden" id="stats">
    <div class="modal-card stats-card">
      <button class="modal-close" id="stats-close" aria-label="閉じる">✕</button>
      <h2>📊 統計</h2>
      <h3 class="stats-h">💰 クレジット推移（直近 <span id="chart-count"></span> スピン）</h3>
      <div class="chart-wrap">
        <canvas id="chart"></canvas>
        <div class="chart-tip hidden" id="chart-tip"></div>
      </div>
      <div class="stats-grid">
        <div class="stats-block">
          <h3 class="stats-h">🧾 実績（累計）</h3>
          <table class="stats-table" id="record-table"></table>
        </div>
        <div class="stats-block">
          <h3 class="stats-h">🎲 確率（お守り込み・<span id="odds-trials"></span>回試行）</h3>
          <table class="stats-table" id="odds-table"></table>
        </div>
      </div>
      <details class="data-table-box">
        <summary>直近20スピンのデータ表</summary>
        <table class="stats-table" id="history-table"></table>
      </details>
    </div>
  </div>
  <div class="modal hidden" id="gameover">
    <div class="modal-card">
      <h2 class="gameover-title">💀 GAME OVER</h2>
      <p class="modal-sub" id="gameover-text"></p>
      <button class="restart" id="restart">🔄 もう一度挑戦</button>
    </div>
  </div>
`;

const stripEls = REEL_STRIPS.map((_, r) => document.querySelector<HTMLElement>(`#strip-${r}`)!);
const creditsEl = document.querySelector<HTMLElement>('#credits')!;
const betEl = document.querySelector<HTMLElement>('#bet')!;
const messageEl = document.querySelector<HTMLElement>('#message')!;
const spinBtn = document.querySelector<HTMLButtonElement>('#spin')!;
const payBtn = document.querySelector<HTMLButtonElement>('#pay')!;
const betDownBtn = document.querySelector<HTMLButtonElement>('#bet-down')!;
const betUpBtn = document.querySelector<HTMLButtonElement>('#bet-up')!;
const paytableBox = document.querySelector<HTMLDetailsElement>('.paytable-box')!;
const cabinetEl = document.querySelector<HTMLElement>('.cabinet')!;
const soundBtn = document.querySelector<HTMLButtonElement>('#sound')!;
const confettiLayer = document.querySelector<HTMLElement>('#confetti')!;
const bigwinEl = document.querySelector<HTMLElement>('#bigwin')!;
const bigwinTextEl = document.querySelector<HTMLElement>('#bigwin-text')!;
const bigwinAmountEl = document.querySelector<HTMLElement>('#bigwin-amount')!;
const roundEl = document.querySelector<HTMLElement>('#round')!;
const normaEl = document.querySelector<HTMLElement>('#norma')!;
const spinsLeftEl = document.querySelector<HTMLElement>('#spins-left')!;
const normaFillEl = document.querySelector<HTMLElement>('#norma-fill')!;
const charmsEl = document.querySelector<HTMLElement>('#charms')!;
const shopEl = document.querySelector<HTMLElement>('#shop')!;
const shopCreditsEl = document.querySelector<HTMLElement>('#shop-credits')!;
const shopItemsEl = document.querySelector<HTMLElement>('#shop-items')!;
const nextRoundBtn = document.querySelector<HTMLButtonElement>('#next-round')!;
const statsOpenBtn = document.querySelector<HTMLButtonElement>('#stats-open')!;
const statsEl = document.querySelector<HTMLElement>('#stats')!;
const statsCloseBtn = document.querySelector<HTMLButtonElement>('#stats-close')!;
const chartEl = document.querySelector<HTMLCanvasElement>('#chart')!;
const chartTipEl = document.querySelector<HTMLElement>('#chart-tip')!;
const chartCountEl = document.querySelector<HTMLElement>('#chart-count')!;
const recordTableEl = document.querySelector<HTMLElement>('#record-table')!;
const oddsTableEl = document.querySelector<HTMLElement>('#odds-table')!;
const oddsTrialsEl = document.querySelector<HTMLElement>('#odds-trials')!;
const historyTableEl = document.querySelector<HTMLElement>('#history-table')!;
const gameoverEl = document.querySelector<HTMLElement>('#gameover')!;
const gameoverTextEl = document.querySelector<HTMLElement>('#gameover-text')!;
const restartBtn = document.querySelector<HTMLButtonElement>('#restart')!;

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

function render() {
  creditsEl.textContent = credits.toLocaleString('ja-JP');
  betEl.textContent = bet.toLocaleString('ja-JP');
  roundEl.textContent = String(run.round);
  normaEl.textContent = norma().toLocaleString('ja-JP');
  spinsLeftEl.textContent = String(run.spinsLeft);
  const ratio = Math.min(1, credits / norma());
  normaFillEl.style.width = `${(ratio * 100).toFixed(1)}%`;
  normaFillEl.classList.toggle('ok', credits >= norma());
  charmsEl.innerHTML = run.charms
    .map((id) => {
      const c = CHARMS.find((x) => x.id === id);
      return c ? `<span class="charm-chip" title="${c.name}: ${c.desc}">${c.char}</span>` : '';
    })
    .join('');

  const playing = phase === 'playing';
  spinBtn.disabled = !playing || spinning || credits < bet || run.spinsLeft <= 0;
  betDownBtn.disabled = !playing || spinning || bet <= MIN_BET;
  betUpBtn.disabled = !playing || spinning;
  payBtn.classList.toggle('hidden', !playing || spinning || credits < norma());
  if (playing && !spinning && credits < bet && credits >= MIN_BET) {
    setMessage(`💦 BET ${bet.toLocaleString('ja-JP')} にはクレジットが足りません`);
  }
}

/** リーチ（2個揃い）のマスをピカッと光らせる */
function flashReach(cells: readonly Cell[]) {
  for (const [reel, row] of cells) {
    const cell = stripEls[reel].children[pos[reel] + row];
    if (!cell) continue;
    cell.classList.remove('reach-flash');
    void (cell as HTMLElement).offsetWidth; // アニメーションを再トリガー
    cell.classList.add('reach-flash');
    setTimeout(() => cell.classList.remove('reach-flash'), 950);
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

/** お守りの効果を反映した配当額 */
function payoutWithMods(w: LineWin | ScatterWin): number {
  return Math.round(w.payout * (mods.symbolMult[w.symbol] ?? 1) * mods.globalMult);
}

function spin() {
  if (spinning || phase !== 'playing' || run.spinsLeft <= 0) return;
  if (credits < bet) {
    render();
    return;
  }
  spinning = true;
  credits -= bet;
  run.spinsLeft--;
  saveRun();
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
      spinReel(r, stop, anticipate && r === stripEls.length - 1 ? 1.4 : 0).then(() => {
        // このリールが止まった時点で2個揃い(リーチ)になったマスをピカッと光らせる
        if (r < stripEls.length - 1) {
          const reaches = findReachRuns(grid, r);
          if (reaches.length > 0) {
            for (const reach of reaches) flashReach(reach.cells);
            sound.reachFlash();
          }
        }
      }),
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
    const scatters = evaluateScatters(grid, bet, mods.scatterMinDelta);
    const total = [...wins, ...scatters].reduce((sum, w) => sum + payoutWithMods(w), 0);
    if (total > 0) {
      credits += total;
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
    } else if (mods.lossRefund > 0) {
      const refund = Math.floor(bet * mods.lossRefund);
      credits += refund;
      setMessage(`😢 ハズレ… 🐷 +${refund.toLocaleString('ja-JP')} 返ってきた`);
    } else {
      setMessage('😢 ハズレ… もう一回！');
    }
    recordSpin(stats, { bet, win: total, credits });
    spinning = false;
    saveRun();
    render();
    checkRoundEnd();
  });
}

/** スピン後のラウンド判定（期限切れ・破産） */
function checkRoundEnd() {
  if (phase !== 'playing') return;
  if (run.spinsLeft <= 0) {
    if (credits >= norma()) {
      clearRound();
    } else {
      gameOver(`ラウンド ${run.round} — ノルマ ${norma().toLocaleString('ja-JP')} に届かなかった…`);
    }
  } else if (credits < MIN_BET && credits < norma()) {
    gameOver(`ラウンド ${run.round} — クレジットが尽きた…`);
  }
}

/** ノルマを支払ってショップへ */
function clearRound() {
  if (phase !== 'playing' || credits < norma()) return;
  credits -= norma();
  sound.bigWin();
  confetti(confettiLayer, 80);
  run.round++;
  phase = 'shop';
  shopOffer = pickShopCharms();
  renderShop();
  shopEl.classList.remove('hidden');
  saveRun();
  render();
}

function renderShop() {
  shopCreditsEl.textContent = credits.toLocaleString('ja-JP');
  shopItemsEl.innerHTML = shopOffer
    .map(
      (c, i) => `
      <div class="shop-item" data-i="${i}">
        <div class="shop-char">${c.char}</div>
        <div class="shop-name">${c.name}</div>
        <div class="shop-desc">${c.desc}</div>
        <button class="shop-buy" data-buy="${i}" ${credits < c.price ? 'disabled' : ''}>💰 ${c.price}</button>
      </div>`,
    )
    .join('');
}

shopItemsEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy]');
  if (!btn || btn.disabled) return;
  const charm = shopOffer[Number(btn.dataset.buy)];
  if (!charm || credits < charm.price) return;
  credits -= charm.price;
  run.charms.push(charm.id);
  mods = computeMods(run.charms);
  shopOffer = shopOffer.filter((c) => c !== charm);
  sound.win();
  renderShop();
  saveRun();
  render();
});

nextRoundBtn.addEventListener('click', () => {
  phase = 'playing';
  run.spinsLeft = spinsFor(mods);
  shopEl.classList.add('hidden');
  setMessage(`⚔️ ラウンド ${run.round} スタート！ 💀 ノルマ ${norma().toLocaleString('ja-JP')}`);
  saveRun();
  render();
});

function gameOver(text: string) {
  phase = 'gameover';
  gameoverTextEl.textContent = text;
  gameoverEl.classList.remove('hidden');
  sound.gameOver();
  render();
}

restartBtn.addEventListener('click', () => {
  run = newRunState();
  credits = run.credits;
  mods = computeMods(run.charms);
  bet = MIN_BET;
  phase = 'playing';
  gameoverEl.classList.add('hidden');
  setMessage(`⚔️ ラウンド 1 スタート！ 💀 ノルマ ${norma().toLocaleString('ja-JP')}`);
  saveRun();
  render();
});

payBtn.addEventListener('click', clearRound);
spinBtn.addEventListener('click', spin);

function changeBet(dir: 1 | -1) {
  if (spinning || phase !== 'playing') return;
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
  if (e.code === 'Space' && phase === 'playing') {
    e.preventDefault();
    spin();
  }
});
soundBtn.addEventListener('click', () => {
  sound.toggle();
  renderSoundBtn();
});

// ---- 統計モーダル ----

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

function openStats() {
  if (spinning) return;
  statsEl.classList.remove('hidden');

  // クレジット推移グラフ
  chartCountEl.textContent = String(stats.history.length);
  renderCreditChart(chartEl, chartTipEl, stats.history);

  // 実績
  const rtpActual = stats.totalBet > 0 ? stats.totalWin / stats.totalBet : 0;
  recordTableEl.innerHTML = `
    <tr><td>総スピン</td><td>${stats.spins.toLocaleString('ja-JP')} 回</td></tr>
    <tr><td>当たり回数</td><td>${stats.hits.toLocaleString('ja-JP')} 回</td></tr>
    <tr><td>当たり率（実績）</td><td>${stats.spins > 0 ? pct(stats.hits / stats.spins) : '—'}</td></tr>
    <tr><td>総BET</td><td>${stats.totalBet.toLocaleString('ja-JP')}</td></tr>
    <tr><td>総WIN</td><td>${stats.totalWin.toLocaleString('ja-JP')}</td></tr>
    <tr><td>還元率（実績）</td><td>${stats.totalBet > 0 ? pct(rtpActual) : '—'}</td></tr>
  `;

  // 理論確率（現在のお守り込みでその場でシミュレーション）
  const odds = simulateOdds(mods);
  oddsTrialsEl.textContent = odds.trials.toLocaleString('ja-JP');
  oddsTableEl.innerHTML = `
    <tr><td>何かしら当たる</td><td>${pct(odds.anyHit)}</td></tr>
    <tr><td>理論還元率</td><td>${pct(odds.rtp, 0)}</td></tr>
    ${(Object.keys(SYMBOLS) as SymbolId[])
      .map(
        (s) =>
          `<tr><td>${SYMBOLS[s].char} ライン当たり</td><td>${pct(odds.lineBySymbol[s])}</td></tr>`,
      )
      .join('')}
    ${Object.entries(odds.scatterBySymbol)
      .map(([s, p]) => `<tr><td>✨${SYMBOLS[s as SymbolId].char} スキャッター</td><td>${pct(p)}</td></tr>`)
      .join('')}
  `;

  // 直近20スピンのデータ表
  const recent = stats.history.slice(-20);
  const offset = stats.history.length - recent.length;
  historyTableEl.innerHTML =
    `<tr><th>#</th><th>BET</th><th>WIN</th><th>💰</th></tr>` +
    recent
      .map(
        (h, i) =>
          `<tr><td>${offset + i + 1}</td><td>${h.bet.toLocaleString('ja-JP')}</td><td>${h.win.toLocaleString('ja-JP')}</td><td>${h.credits.toLocaleString('ja-JP')}</td></tr>`,
      )
      .join('');
}

statsOpenBtn.addEventListener('click', openStats);
statsCloseBtn.addEventListener('click', () => statsEl.classList.add('hidden'));
statsEl.addEventListener('click', (e) => {
  if (e.target === statsEl) statsEl.classList.add('hidden');
});

render();
renderSoundBtn();
setMessage(`⚔️ ラウンド ${run.round}！ 💀 ノルマ ${norma().toLocaleString('ja-JP')} を稼いで支払おう`);
checkRoundEnd();

// 演出プレビュー用の隠しモード（?demo=bigwin で開くとビッグウィン演出を再生）
if (new URLSearchParams(location.search).get('demo') === 'bigwin') {
  showBigWin('BIG WIN!', 12345);
  confetti(confettiLayer, 120);
  shake(cabinetEl);
}
