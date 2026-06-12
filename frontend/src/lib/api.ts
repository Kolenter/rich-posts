/** Базовый URL API (пустой = тот же домен, /api/...) */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export function apiPath(path: string): string {
  return `${API_BASE}${path}`;
}
