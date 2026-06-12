const configuredOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, '') || '';

/** Абсолютный URL для <img> и Telegram (бот не понимает относительные пути). */
export function resolveMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    const origin =
      (typeof window !== 'undefined' && window.location.origin) || configuredOrigin;
    if (origin) return `${origin}${trimmed}`;
  }
  return trimmed;
}
