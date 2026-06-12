import React, { useEffect, useState } from 'react';
import { Clock, ImageOff, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import type { RichPostBlock } from '../data/richPostModel';
import {
  deleteHistory,
  fetchHistory,
  formatHistoryDate,
  type HistoryEntry,
} from '../lib/history';

type HistoryModalProps = {
  initData?: string;
  onClose: () => void;
  onRestore: (blocks: RichPostBlock[], hadMedia: boolean) => void;
};

export function HistoryModal({ initData, onClose, onRestore }: HistoryModalProps) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!initData) {
      setError('Откройте через Telegram');
      setLoading(false);
      return;
    }
    fetchHistory(initData)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [initData]);

  const handleDelete = async (id: string) => {
    if (!initData) return;
    setBusyId(id);
    try {
      await deleteHistory(initData, id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm"
      style={{
        paddingTop: 'var(--superapp-safe-top, 0px)',
        paddingBottom: 'var(--superapp-safe-bottom, 0px)',
      }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-3 app-shell-modal mx-auto w-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-black text-white flex items-center gap-2">
            <Clock className="w-4 h-4" />
            История публикаций
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/15 text-white flex items-center justify-center"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <p className="text-center text-white/80 text-[13px] flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка…
          </p>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] font-semibold text-red-700 mb-3">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-center text-white/70 text-[13px] py-8">
            Пока нет опубликованных постов
          </p>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-900 truncate">{item.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatHistoryDate(item.created_at)} · {item.target}
                  </p>
                </div>
                {item.had_media && (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-md px-1.5 py-0.5"
                    title="Медиа удалены — загрузите заново"
                  >
                    <ImageOff className="w-3 h-3" />
                    медиа
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 mt-2.5">
                <button
                  type="button"
                  onClick={() => onRestore(item.blocks, item.had_media)}
                  className="flex-1 h-8 rounded-lg bg-[#517da2] text-white text-[11px] font-bold inline-flex items-center justify-center gap-1 active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  В редактор
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void handleDelete(item.id)}
                  className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-red-500 inline-flex items-center justify-center disabled:opacity-50"
                  aria-label="Удалить запись"
                >
                  {busyId === item.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {items.some((i) => i.had_media) && (
          <p className="text-[11px] text-white/70 text-center mt-3 px-4 leading-snug">
            Медиафайлы не хранятся после публикации. При восстановлении прикрепите их заново.
          </p>
        )}
      </div>
    </div>
  );
}

export default HistoryModal;
