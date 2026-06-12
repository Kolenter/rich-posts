import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CustomEmojiPreview } from './CustomEmojiPreview';
import { fetchEmojiSuggestions, type EmojiSuggestion } from '../lib/emoji';

const QUICK_EMOJI = ['🙂', '😀', '😍', '🔥', '👍', '❤️', '🎉', '✅', '💰', '💣', '💌', '🎁', '🚀', '😂', '🥳', '💯'];

type EmojiPickerProps = {
  initData?: string;
  onPick: (suggestion: EmojiSuggestion) => void;
};

const PAGE_SIZE = 60;

/** Custom emoji: большой каталог (~3000+), тап → анимация, «Вставить» → в текст. */
export function EmojiPicker({ initData, onPick }: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<EmojiSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [fallback, setFallback] = useState(false);

  const loadPage = useCallback(
    async (emoji: string, offset: number, append: boolean) => {
      if (!initData) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await fetchEmojiSuggestions(emoji, initData, offset, PAGE_SIZE);
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setTotal(result.total);
        setHasMore(result.hasMore);
        setFallback(result.fallback);
        if (!append) {
          setSelectedId(result.items[0]?.id ?? null);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [initData],
  );

  useEffect(() => {
    if (!initData) return;
    const t = setTimeout(() => {
      void loadPage(query, 0, false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, initData, loadPage]);

  const selected = items.find((it) => it.id === selectedId) ?? items[0] ?? null;

  if (!initData) {
    return <p className="text-[11px] text-slate-400">Откройте через Telegram, чтобы подбирать эмодзи.</p>;
  }

  const emptyHint =
    query.trim() && fallback
      ? 'Точного совпадения нет — показан общий каталог. Выберите по картинке.'
      : query.trim() && !items.length
        ? 'Загрузка…'
        : !query.trim()
          ? `Каталог: ${total.toLocaleString('ru-RU')} вариантов. Нажмите символ или листайте.`
          : `${total} вариант(ов) для «${query.trim()}»`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Эмодзи или пусто — все варианты"
          className="flex-1 min-w-0 rounded-md border border-slate-200 px-2 py-1 text-[14px] outline-none focus:border-[#517da2]/50"
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
      </div>

      <div className="flex flex-wrap gap-1">
        {QUICK_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setQuery(e)}
            className="w-7 h-7 rounded-md bg-slate-100 text-[15px] leading-none active:scale-95"
          >
            {e}
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-100/80 px-2 py-1.5">
          <CustomEmojiPreview
            id={selected.id}
            animated={selected.animated}
            fallback={selected.emoji}
            initData={initData}
            playAnimation={selected.animated}
            className="w-10 h-10 shrink-0"
          />
          <div className="flex-1 min-w-0 text-[11px] text-slate-500 leading-snug">
            <p className="font-semibold text-slate-700 truncate">
              {selected.animated ? 'Анимированный' : 'Статичный'} · {selected.set_name}
            </p>
            <p>Тап по варианту — анимация в ячейке.</p>
          </div>
          <button
            type="button"
            onClick={() => onPick(selected)}
            className="shrink-0 h-8 px-3 rounded-lg bg-[#517da2] text-white text-[11px] font-bold active:scale-95"
          >
            Вставить
          </button>
        </div>
      )}

      <p className="text-[10px] text-slate-400 leading-snug">{emptyHint}</p>

      {items.length > 0 ? (
        <>
          <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto pt-0.5">
            {items.map((it) => {
              const isSelected = selectedId === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  className={`relative h-9 rounded-md flex items-center justify-center active:scale-95 ${
                    isSelected ? 'bg-[#517da2]/15 ring-1 ring-[#517da2]/40' : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                  title={`${it.set_name} · ${it.emoji}`}
                >
                  <CustomEmojiPreview
                    id={it.id}
                    animated={it.animated}
                    fallback={it.emoji}
                    initData={initData}
                    playAnimation={it.animated && isSelected}
                    className="w-7 h-7"
                  />
                </button>
              );
            })}
          </div>
          {hasMore && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadPage(query, items.length, true)}
              className="w-full py-1.5 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600 disabled:opacity-50"
            >
              {loadingMore ? 'Загрузка…' : `Ещё (${items.length} / ${total})`}
            </button>
          )}
        </>
      ) : (
        !loading && <p className="text-[11px] text-slate-400">Ничего не загрузилось — попробуйте позже.</p>
      )}

      <p className="text-[10px] text-slate-400 leading-snug">
        В посте Telegram анимация работает, если у владельца бота Premium/Fragment.
      </p>
    </div>
  );
}

export default EmojiPicker;
