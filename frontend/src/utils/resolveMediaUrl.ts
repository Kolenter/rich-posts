const configuredOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, '') || '';

/** Пути загрузок без префикса /uploads (legacy, если не задан RICH_POSTS_UPLOAD_PUBLIC_BASE). */
const UPLOAD_REL_RE = /^\/(\d+)\/([A-Za-z0-9_-]{6,})\/([A-Za-z0-9_.-]+)$/;

function normalizeUploadPath(path: string): string {
  if (path.startsWith('/uploads/')) return path;
  if (UPLOAD_REL_RE.test(path)) return `/uploads${path}`;
  return path;
}

/** Абсолютный URL для <img> и Telegram (бот не понимает относительные пути). */
export function resolveMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;

  if (trimmed.startsWith('/')) {
    const path = normalizeUploadPath(trimmed);
    const origin =
      (typeof window !== 'undefined' && window.location.origin) || configuredOrigin;
    if (origin) return `${origin}${path}`;
    return path;
  }

  return trimmed;
}
