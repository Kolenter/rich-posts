import React from 'react';
import { MapPin } from 'lucide-react';

type MapBlockPreviewProps = {
  lat: string;
  lon: string;
  zoom?: string;
  caption?: string;
  /** true — превью по блокам из ответа Telegram после «Себе». */
  fromTelegram?: boolean;
};

/** Статичное превью блока `<tg-map>` — в клиенте Telegram карта интерактивная, тайлов API нет. */
export function MapBlockPreview({ lat, lon, zoom, caption, fromTelegram }: MapBlockPreviewProps) {
  const la = Number.parseFloat(lat.trim());
  const lo = Number.parseFloat(lon.trim());
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(lo) < 0.001) return null;

  const z = Math.min(Math.max(Number.parseInt(zoom?.trim() ?? '14', 10) || 14, 1), 20);

  return (
    <figure className="my-2.5">
      <div
        className="relative w-full rounded-lg overflow-hidden bg-[#dce3ea] border border-black/[0.06]"
        style={{ height: 160 }}
      >
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(#c5d0db 1px, transparent 1px), linear-gradient(90deg, #c5d0db 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <div className="w-10 h-10 rounded-full bg-[#3390ec] text-white flex items-center justify-center shadow-md mb-2">
            <MapPin className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <p className="text-[11px] text-[#707579]">
            zoom {z} · {la.toFixed(4)}, {lo.toFixed(4)}
          </p>
        </div>
      </div>
      {caption?.trim() && (
        <figcaption className="text-[13px] text-[#707579] mt-1.5 text-center">{caption.trim()}</figcaption>
      )}
      <p className="text-[10px] text-[#9aa0a6] text-center mt-1 leading-snug px-2">
        {fromTelegram
          ? 'Блок map из Telegram. В приложении — интерактивная карта.'
          : 'Черновик блока tg-map. В Telegram — интерактивная карта, не Яндекс/Google.'}
      </p>
    </figure>
  );
}

export default MapBlockPreview;
