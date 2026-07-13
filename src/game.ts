/**
 * スロットの純粋なゲームロジック。DOM には依存しない。
 */

export interface SymbolDef {
  /** 表示文字 */
  char: string;
  /** 3つ揃ったときの配当倍率（BET × 倍率） */
  payout: number;
}

export const SYMBOLS = {
  seven: { char: '7️⃣', payout: 50 },
  diamond: { char: '💎', payout: 25 },
  bell: { char: '🔔', payout: 15 },
  grape: { char: '🍇', payout: 10 },
  orange: { char: '🍊', payout: 8 },
  lemon: { char: '🍋', payout: 5 },
  cherry: { char: '🍒', payout: 3 },
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
];

export const ROWS = 3;

/** ペイライン。各リールで参照する行番号（0=上段, 1=中段, 2=下段） */
export const PAYLINES: readonly (readonly [number, number, number])[] = [
  [1, 1, 1], // 中段
  [0, 0, 0], // 上段
  [2, 2, 2], // 下段
  [0, 1, 2], // 斜め ↘
  [2, 1, 0], // 斜め ↗
];

export interface LineWin {
  line: number;
  symbol: SymbolId;
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

/** 全ペイラインを判定して当たりラインを返す */
export function evaluateWins(grid: readonly (readonly SymbolId[])[], bet: number): LineWin[] {
  const wins: LineWin[] = [];
  PAYLINES.forEach((line, i) => {
    const [a, b, c] = line.map((row, reel) => grid[reel][row]);
    if (a === b && b === c) {
      wins.push({ line: i, symbol: a, payout: SYMBOLS[a].payout * bet });
    }
  });
  return wins;
}
