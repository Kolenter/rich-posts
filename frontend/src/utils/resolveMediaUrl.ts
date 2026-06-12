const PRODUCTION_ORIGIN = 'https://rich.helito.ge';

/** Абсолютный URL для <img> и Telegram (бот не понимает относительные пути). */
export function resolveMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}${trimmed}`;
    }
    return `${PRODUCTION_ORIGIN}${trimmed}`;
  }
  return trimmed;
}
