import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { VoiceRecordPanel } from './VoiceRecordPanel';
import type { MediaItem, MediaKind } from '../data/richPostModel';
import {
  MEDIA_ACCEPT,
  MEDIA_ACCEPT_ALL,
  MEDIA_KIND_LABELS,
  detectMediaKindFromFile,
} from '../utils/mediaKind';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';
import { uploadMediaFile } from '../utils/uploadMedia';

type MediaBlockEditorProps = {
  url: string;
  caption: string;
  credit: string;
  kind: MediaKind;
  initData?: string;
  onChange: (patch: { url?: string; caption?: string; credit?: string; kind?: MediaKind }) => void;
};

export function MediaBlockEditor({ url, caption, credit, kind, initData, onChange }: MediaBlockEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickFile = () => fileRef.current?.click();

  const handleFile = async (file: File, forceKind?: MediaKind) => {
    setUploadError(null);
    const detected = forceKind ?? detectMediaKindFromFile(file);
    onChange({ kind: detected });

    if (!initData) {
      setUploadError('Нет initData — откройте через Telegram');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadMediaFile(file, initData);
      onChange({ url: result.url, kind: result.kind });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(MEDIA_KIND_LABELS) as MediaKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ kind: k })}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
              kind === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {MEDIA_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {kind === 'voice' && (
        <VoiceRecordPanel
          uploading={uploading}
          onRecorded={async (file) => handleFile(file, 'voice')}
        />
      )}

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="URL или загрузите с телефона"
          className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#517da2]/50"
        />
        <button
          type="button"
          onClick={pickFile}
          disabled={uploading}
          className="shrink-0 h-9 px-2.5 rounded-lg bg-[#517da2] text-white text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 disabled:opacity-50"
          title="Загрузить с телефона"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              Файл
            </>
          )}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={MEDIA_ACCEPT[kind] || MEDIA_ACCEPT_ALL}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {uploadError && <p className="text-[11px] text-red-600 font-medium">{uploadError}</p>}

      <input
        value={caption}
        onChange={(e) => onChange({ caption: e.target.value })}
        placeholder="Подпись (необязательно)"
        className="w-full border-0 border-b border-slate-100 bg-transparent py-1 text-[13px] text-slate-500 outline-none"
      />

      <input
        value={credit ?? ''}
        onChange={(e) => onChange({ credit: e.target.value })}
        placeholder="Автор / источник (необязательно)"
        className="w-full border-0 border-b border-slate-100 bg-transparent py-1 text-[13px] text-slate-400 outline-none"
      />

      {url && kind === 'photo' && (
        <img
          src={resolveMediaUrl(url)}
          alt=""
          className="w-full max-h-44 object-cover rounded-xl bg-slate-100"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = '0.3';
          }}
        />
      )}
      {url && kind === 'video' && (
        <video
          src={resolveMediaUrl(url)}
          controls
          className="w-full max-h-44 rounded-xl bg-black"
          preload="metadata"
        />
      )}
      {url && kind === 'animation' && (
        <img
          src={resolveMediaUrl(url)}
          alt=""
          className="w-full max-h-44 object-contain rounded-xl bg-slate-100"
          loading="lazy"
        />
      )}
      {url && (kind === 'audio' || kind === 'voice') && (
        <audio src={resolveMediaUrl(url)} controls className="w-full" preload="metadata" />
      )}
    </div>
  );
}

type MediaGroupEditorProps = {
  items: MediaItem[];
  caption: string;
  credit: string;
  initData?: string;
  onChange: (patch: { items?: MediaItem[]; caption?: string; credit?: string }) => void;
};

export function MediaGroupEditor({ items, caption, credit, initData, onChange }: MediaGroupEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const updateItem = (index: number, patch: Partial<MediaItem>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange({ items: next });
  };

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange({ items: next.length ? next : [{ url: '', kind: 'photo' }] });
  };

  const addFiles = async (files: FileList | File[]) => {
    setUploadError(null);
    if (!initData) {
      setUploadError('Нет initData — откройте через Telegram');
      return;
    }
    setUploading(true);
    try {
      const uploaded: MediaItem[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadMediaFile(file, initData);
        uploaded.push({ url: result.url, kind: result.kind });
      }
      const cleaned = items.filter((i) => i.url.trim());
      onChange({ items: [...cleaned, ...uploaded] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#517da2] text-white text-[11px] font-bold active:scale-95 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-3.5 h-3.5" />
              Добавить с телефона
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => onChange({ items: [...items, { url: '', kind: 'photo' }] })}
          className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600"
        >
          + URL
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={MEDIA_ACCEPT_ALL}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {uploadError && <p className="text-[11px] text-red-600 font-medium">{uploadError}</p>}

      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start rounded-lg border border-slate-100 p-2">
          <div className="flex-1 min-w-0 space-y-1">
            <input
              value={item.url}
              onChange={(e) => updateItem(i, { url: e.target.value })}
              placeholder={`URL ${MEDIA_KIND_LABELS[item.kind]}`}
              className="w-full rounded border border-slate-200 px-2 py-1 text-[12px] outline-none"
            />
            {item.url && item.kind === 'photo' && (
              <img src={resolveMediaUrl(item.url)} alt="" className="w-full max-h-24 object-cover rounded-lg" />
            )}
            {item.url && item.kind === 'video' && (
              <video src={resolveMediaUrl(item.url)} controls className="w-full max-h-24 rounded-lg" preload="metadata" />
            )}
          </div>
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="shrink-0 p-1 text-slate-300 hover:text-red-500"
            aria-label="Удалить"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <input
        value={caption}
        onChange={(e) => onChange({ caption: e.target.value })}
        placeholder="Общая подпись"
        className="w-full border-0 border-b border-slate-100 bg-transparent py-1 text-[13px] text-slate-500 outline-none"
      />

      <input
        value={credit ?? ''}
        onChange={(e) => onChange({ credit: e.target.value })}
        placeholder="Автор / источник (необязательно)"
        className="w-full border-0 border-b border-slate-100 bg-transparent py-1 text-[13px] text-slate-400 outline-none"
      />
    </div>
  );
}
