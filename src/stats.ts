/**
 * プレイ実績の記録と、理論確率のシミュレーション。
 */

import {
  SYMBOLS,
  SCATTERS,
  spinStops,
  gridFromStops,
  evaluateWins,
  evaluateScatters,
  type SymbolId,
} from './game';
import type { Mods } from './charms';

const STATS_KEY = 'slot-web:stats';
const HISTORY_MAX = 300;

export interface SpinRecord {
  bet: number;
  win: number;
  credits: number;
}

export interface Stats {
  spins: number;
  hits: number;
  totalBet: number;
  totalWin: number;
  history: SpinRecord[];
}

function emptyStats(): Stats {
  return { spins: 0, hits: 0, totalBet: 0, totalWin: 0, history: [] };
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Stats;
      if (Number.isFinite(data.spins) && Array.isArray(data.history)) return data;
    }
  } catch {
    /* 壊れたデータは捨てて新規に */
  }
  return emptyStats();
}

export function recordSpin(stats: Stats, record: SpinRecord) {
  stats.spins++;
  stats.totalBet += record.bet;
  stats.totalWin += record.win;
  if (record.win > 0) stats.hits++;
  stats.history.push(record);
  if (stats.history.length > HISTORY_MAX) {
    stats.history.splice(0, stats.history.length - HISTORY_MAX);
  }
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* 保存できなくても続行 */
  }
}

export interface Odds {
  /** 何かしら当たる確率 */
  anyHit: number;
  /** 絵柄ごとのライン当たり(3個以上)確率 */
  lineBySymbol: Record<SymbolId, number>;
  /** スキャッター絵柄ごとの成立確率 */
  scatterBySymbol: Partial<Record<SymbolId, number>>;
  /** お守り込みの理論還元率（BETに対する平均リターン） */
  rtp: number;
  /** 試行回数 */
  trials: number;
}

/**
 * 現在のお守り効果を反映した確率をモンテカルロで求める。
 * 数千回程度なら一瞬で終わる。
 */
export function simulateOdds(mods: Mods, trials = 4000): Odds {
  const lineBySymbol = Object.fromEntries(
    Object.keys(SYMBOLS).map((s) => [s, 0]),
  ) as Record<SymbolId, number>;
  const scatterBySymbol: Partial<Record<SymbolId, number>> = Object.fromEntries(
    Object.keys(SCATTERS).map((s) => [s, 0]),
  );
  let anyHit = 0;
  let totalReturn = 0;

  for (let i = 0; i < trials; i++) {
    const grid = gridFromStops(spinStops());
    const wins = evaluateWins(grid, 1);
    const scatters = evaluateScatters(grid, 1, mods.scatterMinDelta);
    const lineSymbols = new Set(wins.map((w) => w.symbol));
    for (const s of lineSymbols) lineBySymbol[s]++;
    for (const w of scatters) scatterBySymbol[w.symbol]!++;
    if (wins.length > 0 || scatters.length > 0) anyHit++;
    for (const w of [...wins, ...scatters]) {
      totalReturn += w.payout * (mods.symbolMult[w.symbol] ?? 1) * mods.globalMult;
    }
    if (wins.length === 0 && scatters.length === 0) totalReturn += mods.lossRefund;
  }

  for (const s of Object.keys(lineBySymbol) as SymbolId[]) lineBySymbol[s] /= trials;
  for (const s of Object.keys(scatterBySymbol) as SymbolId[]) scatterBySymbol[s]! /= trials;
  return { anyHit: anyHit / trials, lineBySymbol, scatterBySymbol, rtp: totalReturn / trials, trials };
}
