import React from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

type VoiceRecordPanelProps = {
  disabled?: boolean;
  uploading?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
};

export function VoiceRecordPanel({ disabled, uploading, onRecorded }: VoiceRecordPanelProps) {
  const { state, formattedDuration, error, start, stop, cancel, supported } = useVoiceRecorder();

  if (!supported) {
    return (
      <p className="text-[11px] text-slate-500 leading-snug">
        Запись в приложении недоступна — загрузите готовый .ogg через «Файл».
      </p>
    );
  }

  const busy = disabled || uploading || state === 'processing';

  const handleStop = async () => {
    const file = await stop();
    if (file) await onRecorded(file);
  };

  if (state === 'recording') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 px-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-[13px] font-bold text-red-700 tabular-nums">{formattedDuration}</span>
            <span className="text-[11px] text-red-600/80 truncate">Запись…</span>
          </div>
          <button
            type="button"
            onClick={() => void handleStop()}
            className="shrink-0 h-8 px-3 rounded-lg bg-red-600 text-white text-[11px] font-bold inline-flex items-center gap-1 active:scale-95"
          >
            <Square className="w-3 h-3 fill-current" />
            Стоп
          </button>
        </div>
        <button
          type="button"
          onClick={cancel}
          className="text-[11px] text-slate-500 font-semibold"
        >
          Отмена
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="w-full h-10 rounded-xl bg-red-500 text-white font-bold text-[12px] inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
      >
        {uploading || state === 'processing' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка…
          </>
        ) : (
          <>
            <Mic className="w-4 h-4" />
            Записать голосовое
          </>
        )}
      </button>
      <p className="text-[10px] text-slate-400 text-center leading-snug">
        Нажмите и говорите · до 3 мин · нужен доступ к микрофону
      </p>
      {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
