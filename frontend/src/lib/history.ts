import type { RichPostBlock } from '../data/richPostModel';
import { apiPath } from './api';

export type HistoryEntry = {
  id: string;
  created_at: number;
  mode: string;
  target: string;
  message_id: number | null;
  title: string;
  had_media: boolean;
  blocks: RichPostBlock[];
};

export async function fetchHistory(initData: string): Promise<HistoryEntry[]> {
  const res = await fetch(apiPath('/api/v1/rich-posts/history'), {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  if (!res.ok) throw new Error('Не удалось загрузить историю');
  const data = (await res.json()) as { items?: HistoryEntry[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function deleteHistory(initData: string, id: string): Promise<void> {
  const res = await fetch(apiPath(`/api/v1/rich-posts/history/${id}`), {
    method: 'DELETE',
    headers: { 'X-Telegram-Init-Data': initData },
  });
  if (!res.ok && res.status !== 404) throw new Error('Не удалось удалить запись');
}

export function formatHistoryDate(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
