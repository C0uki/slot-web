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
  seven: { char: '7️⃣', payouts: [20, 100, 500] },
  diamond: { char: '💎', payouts: [10, 50, 200] },
  bell: { char: '🔔', payouts: [8, 25, 100] },
  grape: { char: '🍇', payouts: [5, 15, 60] },
  orange: { char: '🍊', payouts: [4, 10, 40] },
  lemon: { char: '🍋', payouts: [2, 8, 20] },
  cherry: { char: '🍒', payouts: [1, 5, 10] },
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

/** ペイライン。各リールで参照する行番号（0=最上段〜4=最下段）。横5本＋斜め2本 */
export const PAYLINES: readonly (readonly number[])[] = [
  [2, 2, 2, 2, 2], // 中段
  [1, 1, 1, 1, 1],
  [3, 3, 3, 3, 3],
  [0, 0, 0, 0, 0], // 最上段
  [4, 4, 4, 4, 4], // 最下段
  [0, 1, 2, 3, 4], // 斜め ↘
  [4, 3, 2, 1, 0], // 斜め ↗
];

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
  line: number;
  symbol: SymbolId;
  /** 左から連続した個数（3〜5） */
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
 * 全ペイラインを判定する。
 * 左端(リール0)から同じ絵柄が3個以上連続していれば当たり。
 */
export function evaluateWins(grid: readonly (readonly SymbolId[])[], bet: number): LineWin[] {
  const wins: LineWin[] = [];
  PAYLINES.forEach((line, i) => {
    const first = grid[0][line[0]];
    let count = 1;
    while (count < line.length && grid[count][line[count]] === first) count++;
    if (count >= 3) {
      wins.push({ line: i, symbol: first, count, payout: SYMBOLS[first].payouts[count - 3] * bet });
    }
  });
  return wins;
}
