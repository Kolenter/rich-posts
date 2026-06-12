/**
 * Telegram Desktop crash when math is nested inside <details> in Rich Messages.
 * @see https://github.com/telegramdesktop/tdesktop/issues/30808
 */

const MATH_FENCE = /```\s*math\b/i;
/** Inline LaTeX: $...$ (pair on one line) */
const INLINE_MATH = /\$[^\$\n]+?\$/;
const DETAILS_BLOCK = /<details[^>]*>([\s\S]*?)<\/details>/gi;

export const MATH_IN_DETAILS_ERROR =
  'Формулы внутри «Скрытый блок» крашат Telegram Desktop. Вынесите формулы отдельным блоком «Формула».';

export function textContainsRichMath(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return MATH_FENCE.test(t) || INLINE_MATH.test(t);
}

/** Сканирует итоговый markdown (в т.ч. сырой HTML в параграфах). */
export function markdownHasMathInsideDetails(markdown: string): boolean {
  DETAILS_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DETAILS_BLOCK.exec(markdown)) !== null) {
    if (textContainsRichMath(match[1])) return true;
  }
  return false;
}

export function detailsFieldsContainMath(summary: string, body: string): boolean {
  return textContainsRichMath(summary) || textContainsRichMath(body);
}
