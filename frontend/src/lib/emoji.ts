import { apiPath } from './api';

export type EmojiSuggestion = {
  id: string;
  emoji: string;
  animated: boolean;
  set_name: string;
};

export type EmojiSuggestResult = {
  items: EmojiSuggestion[];
  total: number;
  hasMore: boolean;
  fallback: boolean;
  queryKey: string;
};

/** Подсказки custom emoji по символу или листание всего каталога. */
export async function fetchEmojiSuggestions(
  emoji: string,
  initData: string,
  offset = 0,
  limit = 60,
): Promise<EmojiSuggestResult> {
  const params = new URLSearchParams({
    emoji,
    offset: String(offset),
    limit: String(limit),
  });
  const res = await fetch(apiPath(`/api/v1/rich-posts/emoji-suggest?${params}`), {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  if (!res.ok) {
    return { items: [], total: 0, hasMore: false, fallback: false, queryKey: '' };
  }
  const data = (await res.json().catch(() => ({}))) as {
    items?: EmojiSuggestion[];
    total?: number;
    has_more?: boolean;
    fallback?: boolean;
    query_key?: string;
  };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: data.total ?? 0,
    hasMore: !!data.has_more,
    fallback: !!data.fallback,
    queryKey: data.query_key ?? '',
  };
}
