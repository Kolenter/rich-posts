import type { RichPostBlock } from '../data/richPostModel';

export function reorderBlocks(
  blocks: RichPostBlock[],
  fromIndex: number,
  toIndex: number,
): RichPostBlock[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= blocks.length ||
    toIndex >= blocks.length
  ) {
    return blocks;
  }
  const next = [...blocks];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function blockIndexFromPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const row = el?.closest('[data-block-index]');
  if (!row) return null;
  const idx = Number(row.getAttribute('data-block-index'));
  return Number.isFinite(idx) ? idx : null;
}
