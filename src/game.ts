/**
 * スロットの純粋なゲームロジック。DOM には依存しない。
 */

export interface SymbolDef {
  /** 表示文字 */
  char: string;
  /** 左から 3 / 4 / 5 個連続したときの配当倍率（BET × 倍率） */
  payouts: readonly [number, number, number];
}

export const SYMBOLS = {
  seven: { char: '7️⃣', payouts: [10, 50, 250] },
  diamond: { char: '💎', payouts: [3, 15, 100] },
  bell: { char: '🔔', payouts: [2, 8, 50] },
  grape: { char: '🍇', payouts: [1, 5, 25] },
  orange: { char: '🍊', payouts: [1, 4, 15] },
  lemon: { char: '🍋', payouts: [1, 2, 8] },
  cherry: { char: '🍒', payouts: [1, 2, 5] },
} as const satisfies Record<string, SymbolDef>;

export type SymbolId = keyof typeof SYMBOLS;

/**
 * リールストリップ（各20コマ）。出現数はリール共通:
 * seven×1, diamond×2, bell×2, grape×3, orange×3, lemon×4, cherry×5
 */
export const REEL_STRIPS: readonly (readonly SymbolId[])[] = [
  ['cherry', 'lemon', 'seven', 'grape', 'cherry', 'orange', 'lemon', 'bell', 'cherry', 'diamond',
   'lemon', 'grape', 'cherry', 'orange', 'bell', 'lemon', 'grape', 'cherry', 'orange', 'diamond'],
  ['lemon', 'cherry', 'bell', 'orange', 'cherry', 'grape', 'diamond', 'lemon', 'cherry', 'seven',
   'orange', 'lemon', 'cherry', 'grape', 'bell', 'orange', 'cherry', 'diamond', 'lemon', 'grape'],
  ['grape', 'cherry', 'lemon', 'diamond', 'orange', 'cherry', 'lemon', 'bell', 'grape', 'cherry',
   'seven', 'lemon', 'orange', 'cherry', 'diamond', 'grape', 'lemon', 'cherry', 'bell', 'orange'],
  ['orange', 'lemon', 'cherry', 'diamond', 'grape', 'cherry', 'lemon', 'seven', 'orange', 'cherry',
   'bell', 'lemon', 'grape', 'cherry', 'orange', 'diamond', 'lemon', 'cherry', 'grape', 'bell'],
  ['cherry', 'grape', 'lemon', 'bell', 'cherry', 'orange', 'diamond', 'lemon', 'cherry', 'grape',
   'orange', 'seven', 'cherry', 'lemon', 'bell', 'orange', 'cherry', 'diamond', 'grape', 'lemon'],
];

export const ROWS = 5;

/** 盤面上の位置 [リール, 行] */
export type Cell = readonly [number, number];

/**
 * 当たり判定の対象ライン。横5本＋長さ3以上の斜め全部（↘5本・↗5本）。
 * ライン上のどの位置でも3個以上並べば当たり。
 */
export const WIN_LINES: readonly (readonly Cell[])[] = buildWinLines();

function buildWinLines(): (readonly Cell[])[] {
  const n = ROWS;
  const lines: Cell[][] = [];
  // 横
  for (let row = 0; row < n; row++) {
    lines.push(REEL_STRIPS.map((_, reel) => [reel, row] as const));
  }
  // 斜め ↘（row - reel が一定）と ↗（row + reel が一定）
  for (let d = -(n - 3); d <= n - 3; d++) {
    const down: Cell[] = [];
    for (let reel = 0; reel < n; reel++) {
      const row = reel + d;
      if (row >= 0 && row < n) down.push([reel, row]);
    }
    lines.push(down);
  }
  for (let s = 2; s <= 2 * (n - 1) - 2; s++) {
    const up: Cell[] = [];
    for (let reel = 0; reel < n; reel++) {
      const row = s - reel;
      if (row >= 0 && row < n) up.push([reel, row]);
    }
    lines.push(up);
  }
  return lines;
}

/**
 * スキャッター配当: ラインに揃わなくても、画面(5×5)のどこでも
 * 対象の絵柄が count 個以上あれば BET × payout を払い出す。
 * 条件を満たす中で最も高い段が適用される。
 */
export const SCATTERS: Partial<Record<SymbolId, readonly { count: number; payout: number }[]>> = {
  seven: [
    { count: 3, payout: 1 },
    { count: 4, payout: 5 },
    { count: 5, payout: 30 },
  ],
  cherry: [
    { count: 8, payout: 1 },
    { count: 10, payout: 5 },
  ],
};

export interface ScatterWin {
  symbol: SymbolId;
  count: number;
  payout: number;
}

/** 画面全体の絵柄数を数えてスキャッター配当を判定する */
export function evaluateScatters(
  grid: readonly (readonly SymbolId[])[],
  bet: number,
): ScatterWin[] {
  const counts: Partial<Record<SymbolId, number>> = {};
  for (const column of grid) {
    for (const s of column) counts[s] = (counts[s] ?? 0) + 1;
  }
  const wins: ScatterWin[] = [];
  for (const [symbol, tiers] of Object.entries(SCATTERS) as [
    SymbolId,
    readonly { count: number; payout: number }[],
  ][]) {
    const count = counts[symbol] ?? 0;
    const tier = tiers.filter((t) => count >= t.count).at(-1);
    if (tier) {
      wins.push({ symbol, count, payout: tier.payout * bet });
    }
  }
  return wins;
}

export interface LineWin {
  /** 揃ったマスの位置 */
  cells: readonly Cell[];
  symbol: SymbolId;
  /** 連続した個数（3〜5） */
  count: number;
  payout: number;
}

/** 各リールの停止位置（ストリップ上のindex）を抽選する */
export function spinStops(rng: () => number = Math.random): number[] {
  return REEL_STRIPS.map((strip) => Math.floor(rng() * strip.length));
}

/** 停止位置から表示グリッドを求める。grid[リール][行] */
export function gridFromStops(stops: readonly number[]): SymbolId[][] {
  return REEL_STRIPS.map((strip, reel) =>
    Array.from({ length: ROWS }, (_, row) => strip[(stops[reel] + row) % strip.length]),
  );
}

/**
 * 全ラインを判定する。
 * ライン上のどの位置でも同じ絵柄が3個以上連続していれば当たり
 * （1本のラインに複数の連続があればそれぞれ当たり）。
 */
export function evaluateWins(grid: readonly (readonly SymbolId[])[], bet: number): LineWin[] {
  const wins: LineWin[] = [];
  for (const line of WIN_LINES) {
    let i = 0;
    while (i < line.length) {
      const [reel, row] = line[i];
      const symbol = grid[reel][row];
      let end = i + 1;
      while (end < line.length && grid[line[end][0]][line[end][1]] === symbol) end++;
      const count = end - i;
      if (count >= 3) {
        wins.push({
          cells: line.slice(i, end),
          symbol,
          count,
          payout: SYMBOLS[symbol].payouts[count - 3] * bet,
        });
      }
      i = end;
    }
  }
  return wins;
}
