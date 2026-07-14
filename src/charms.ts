/**
 * ローグライクモード（CloverPit風）のお守り・ラウンド定義。
 */

import type { SymbolId } from './game';

export interface Charm {
  id: string;
  char: string;
  name: string;
  desc: string;
  price: number;
  /** 対象絵柄の配当倍率 */
  symbolMult?: Partial<Record<SymbolId, number>>;
  /** 全配当への倍率 */
  globalMult?: number;
  /** 毎ラウンドのスピン回数追加 */
  extraSpins?: number;
  /** スキャッターの必要個数の増減 */
  scatterMinDelta?: number;
  /** ハズレ時にBETの何割を返却するか */
  lossRefund?: number;
}

export const CHARMS: readonly Charm[] = [
  { id: 'cherry', char: '🍒', name: 'さくらんぼのお守り', desc: '🍒の配当が2倍', price: 50, symbolMult: { cherry: 2 } },
  { id: 'lemon', char: '🍋', name: 'レモンのお守り', desc: '🍋の配当が2倍', price: 50, symbolMult: { lemon: 2 } },
  { id: 'fruits', char: '🍇', name: 'フルーツバスケット', desc: '🍇と🍊の配当が2倍', price: 70, symbolMult: { grape: 2, orange: 2 } },
  { id: 'jewel', char: '💎', name: '宝石箱', desc: '💎と🔔の配当が2倍', price: 90, symbolMult: { diamond: 2, bell: 2 } },
  { id: 'seven', char: '7️⃣', name: 'ラッキーセブン', desc: '7️⃣の配当が2倍', price: 100, symbolMult: { seven: 2 } },
  { id: 'clover', char: '🍀', name: '四つ葉のクローバー', desc: 'すべての配当が1.5倍', price: 150, globalMult: 1.5 },
  { id: 'hourglass', char: '⏳', name: '砂時計', desc: '毎ラウンドのスピン回数+3', price: 80, extraSpins: 3 },
  { id: 'magnet', char: '🧲', name: '磁石', desc: 'スキャッターの必要個数-1', price: 90, scatterMinDelta: -1 },
  { id: 'piggy', char: '🐷', name: 'ブタの貯金箱', desc: 'ハズレのときBETの半分が返ってくる', price: 70, lossRefund: 0.5 },
];

export interface Mods {
  symbolMult: Partial<Record<SymbolId, number>>;
  globalMult: number;
  extraSpins: number;
  scatterMinDelta: number;
  lossRefund: number;
}

/** 所持しているお守りから効果を合算する（同じお守りは重ねがけで累積） */
export function computeMods(charmIds: readonly string[]): Mods {
  const mods: Mods = {
    symbolMult: {},
    globalMult: 1,
    extraSpins: 0,
    scatterMinDelta: 0,
    lossRefund: 0,
  };
  for (const id of charmIds) {
    const charm = CHARMS.find((c) => c.id === id);
    if (!charm) continue;
    if (charm.symbolMult) {
      for (const [sym, mult] of Object.entries(charm.symbolMult) as [SymbolId, number][]) {
        mods.symbolMult[sym] = (mods.symbolMult[sym] ?? 1) * mult;
      }
    }
    mods.globalMult *= charm.globalMult ?? 1;
    mods.extraSpins += charm.extraSpins ?? 0;
    mods.scatterMinDelta += charm.scatterMinDelta ?? 0;
    mods.lossRefund = Math.min(0.9, mods.lossRefund + (charm.lossRefund ?? 0));
  }
  return mods;
}

/** ラウンドごとのノルマ（支払額）。150から倍々で増える */
export function normaFor(round: number): number {
  return 150 * 2 ** (round - 1);
}

/** ラウンドごとのスピン回数 */
export function spinsFor(mods: Mods): number {
  return 10 + mods.extraSpins;
}

/** ショップに並べるお守りをランダムに3つ選ぶ */
export function pickShopCharms(rng: () => number = Math.random): Charm[] {
  const pool = [...CHARMS];
  const picked: Charm[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    picked.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  }
  return picked;
}
