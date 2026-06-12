import { useEffect, useRef, useState } from 'react';
import pako from 'pako';
import lottie, { type AnimationItem } from 'lottie-web';
import { apiPath } from '../lib/api';

type CustomEmojiPreviewProps = {
  id: string;
  animated: boolean;
  fallback: string;
  initData?: string;
  /** true — проигрывать анимацию (для hover/выбранного), false — только миниатюра */
  playAnimation?: boolean;
  className?: string;
};

/** Превью custom emoji: webp-миниатюра или Lottie-анимация (.tgs). */
export function CustomEmojiPreview({
  id,
  animated,
  fallback,
  initData,
  playAnimation = false,
  className = 'w-7 h-7',
}: CustomEmojiPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'fallback' | 'thumb' | 'lottie'>('fallback');
  const [animLoading, setAnimLoading] = useState(false);

  useEffect(() => {
    if (!initData || !id) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await fetch(apiPath(`/api/v1/rich-posts/emoji-preview/${id}`), {
          headers: { 'X-Telegram-Init-Data': initData },
        });
        if (!res.ok || cancelled) return;
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) {
          setThumbUrl(objectUrl);
          setMode('thumb');
        }
      } catch {
        /* остаётся fallback-символ */
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, initData]);

  useEffect(() => {
    if (!playAnimation || !animated || !initData || !id || !containerRef.current) {
      animRef.current?.destroy();
      animRef.current = null;
      setAnimLoading(false);
      if (thumbUrl) setMode('thumb');
      return;
    }

    let cancelled = false;
    animRef.current?.destroy();
    animRef.current = null;
    setAnimLoading(true);

    (async () => {
      try {
        const res = await fetch(apiPath(`/api/v1/rich-posts/emoji-sticker/${id}`), {
          headers: { 'X-Telegram-Init-Data': initData },
        });
        if (!res.ok || cancelled || !containerRef.current) return;
        const buf = new Uint8Array(await res.arrayBuffer());
        const json = JSON.parse(pako.inflate(buf, { to: 'string' })) as object;
        if (cancelled || !containerRef.current) return;
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: json,
        });
        setMode('lottie');
      } catch {
        if (thumbUrl) setMode('thumb');
      } finally {
        if (!cancelled) setAnimLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
      setAnimLoading(false);
    };
  }, [playAnimation, animated, id, initData, thumbUrl]);

  return (
    <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
      {mode !== 'lottie' && thumbUrl ? (
        <img src={thumbUrl} alt="" className="w-full h-full object-contain" draggable={false} />
      ) : mode === 'fallback' ? (
        <span className="text-[18px] leading-none">{fallback}</span>
      ) : null}
      <div
        ref={containerRef}
        className={`absolute inset-0 ${mode === 'lottie' ? '' : 'opacity-0 pointer-events-none'}`}
      />
      {animLoading && mode !== 'lottie' && (
        <span className="absolute inset-0 flex items-center justify-center bg-white/60 rounded">
          <span className="w-3 h-3 border-2 border-[#517da2]/30 border-t-[#517da2] rounded-full animate-spin" />
        </span>
      )}
    </div>
  );
}

export default CustomEmojiPreview;
