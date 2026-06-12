import React, { useRef } from 'react';
import type { MediaKind, RichPostBlock } from '../data/richPostModel';
import type { TelegramRichBlock, TelegramRichText } from '../data/telegramRichTypes';
import { MEDIA_KIND_LABELS } from '../utils/mediaKind';
import { renderTelegramRichText } from '../utils/renderTelegramRichText';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';
import { MapBlockPreview } from './MapBlockPreview';

const HEADING_CLASS: Record<number, string> = {
  1: 'text-[22px] font-bold leading-tight text-[#000000] mb-2 mt-1',
  2: 'text-[19px] font-bold leading-snug text-[#000000] mb-2 mt-1',
  3: 'text-[17px] font-semibold leading-snug text-[#000000] mb-1.5 mt-1',
  4: 'text-[16px] font-semibold leading-snug text-[#000000] mb-1.5 mt-1',
  5: 'text-[15px] font-semibold text-[#000000] mb-1 mt-1',
  6: 'text-[14px] font-semibold text-[#000000] mb-1 mt-1',
};

type MediaFallback = {
  url: string;
  caption: string;
  kind: MediaKind;
};

type MediaFallbacks = {
  media: MediaFallback[];
  maps: { lat: string; lon: string; zoom: string; caption: string }[];
};

function collectMediaFallbacks(blocks: RichPostBlock[]): MediaFallbacks {
  const media: MediaFallback[] = [];
  const maps: MediaFallbacks['maps'] = [];
  for (const block of blocks) {
    if (block.type === 'media' && block.url.trim()) {
      media.push({ url: block.url, caption: block.caption, kind: block.kind });
    }
    if ((block.type === 'collage' || block.type === 'slideshow') && block.items.length) {
      for (const item of block.items) {
        if (item.url.trim()) media.push({ url: item.url, caption: '', kind: item.kind });
      }
    }
    if (block.type === 'map' && block.lat.trim() && block.lon.trim()) {
      maps.push({
        lat: block.lat,
        lon: block.lon,
        zoom: block.zoom || '14',
        caption: block.caption,
      });
    }
  }
  return { media, maps };
}

function shiftMedia(fallbacks: React.MutableRefObject<MediaFallbacks>): MediaFallback | undefined {
  return fallbacks.current.media.shift();
}

function renderMediaPreview(fallback: MediaFallback | undefined, captionText: unknown, credit?: unknown) {
  const url = fallback ? resolveMediaUrl(fallback.url) : '';
  const kind = fallback?.kind ?? 'photo';
  const cap =
    captionText != null
      ? renderTelegramRichText(captionText as Parameters<typeof renderTelegramRichText>[0])
      : fallback?.caption;

  if (!url) {
    return (
      <div className="my-2.5 rounded-lg bg-black/[0.04] px-4 py-8 text-center text-[13px] text-[#707579]">
        {MEDIA_KIND_LABELS[kind]}
      </div>
    );
  }

  return (
    <figure className="my-2.5 -mx-0.5">
      {kind === 'photo' && (
        <img
          src={url}
          alt={fallback?.caption || 'Фото'}
          className="w-full rounded-lg max-h-64 object-cover bg-black/[0.04]"
          loading="lazy"
        />
      )}
      {kind === 'video' && (
        <video src={url} controls className="w-full rounded-lg max-h-64 bg-black" preload="metadata" />
      )}
      {kind === 'animation' && (
        <img src={url} alt="" className="w-full rounded-lg max-h-64 object-contain bg-black/[0.04]" loading="lazy" />
      )}
      {(kind === 'audio' || kind === 'voice') && (
        <div className="rounded-lg bg-black/[0.04] px-3 py-3">
          <p className="text-[11px] text-[#707579] mb-2">{MEDIA_KIND_LABELS[kind]}</p>
          <audio src={url} controls className="w-full" preload="metadata" />
        </div>
      )}
      {(cap || credit) && (
        <figcaption className="text-[13px] text-[#707579] mt-1.5 text-center px-1">
          {cap}
          {credit != null && (
            <cite className="block not-italic text-[12px] mt-0.5">
              {renderTelegramRichText(credit as Parameters<typeof renderTelegramRichText>[0])}
            </cite>
          )}
        </figcaption>
      )}
    </figure>
  );
}

function renderNestedBlocks(
  blocks: TelegramRichBlock[] | undefined,
  keyPrefix: string,
  fallbacks: React.MutableRefObject<MediaFallbacks>,
  editorBlocks: RichPostBlock[],
) {
  if (!blocks?.length) return null;
  return blocks.map((block, i) => (
    <TelegramBlock
      key={`${keyPrefix}-${i}`}
      block={block}
      fallbacks={fallbacks}
      editorBlocks={editorBlocks}
    />
  ));
}

function TelegramBlock({
  block,
  fallbacks,
  editorBlocks,
}: {
  block: TelegramRichBlock;
  fallbacks: React.MutableRefObject<MediaFallbacks>;
  editorBlocks: RichPostBlock[];
}) {
  switch (block.type) {
    case 'heading': {
      const size = Math.min(Math.max(block.size ?? 1, 1), 6);
      const Tag = (`h${size}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6');
      return (
        <Tag className={HEADING_CLASS[size] ?? HEADING_CLASS[3]}>
          {renderTelegramRichText(block.text)}
        </Tag>
      );
    }
    case 'paragraph':
      if (block.text == null) return null;
      return (
        <p className="text-[16px] leading-[1.45] text-[#000000] mb-2.5 whitespace-pre-wrap break-words">
          {renderTelegramRichText(block.text)}
        </p>
      );
    case 'list':
      if (!block.items?.length) return null;
      return (
        <div className="mb-2.5 space-y-1.5 text-[16px] text-[#000000] leading-[1.45]">
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-2 items-start pl-0.5">
              {item.has_checkbox ? (
                <span
                  className={`mt-1 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${
                    item.is_checked ? 'bg-[#3390ec] border-[#3390ec] text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {item.is_checked ? '✓' : ''}
                </span>
              ) : (
                <span className="w-5 shrink-0 text-right text-[#707579] tabular-nums pt-0.5">
                  {item.label ?? '•'}
                </span>
              )}
              <div className="flex-1 min-w-0 break-words">
                {renderNestedBlocks(item.blocks, `li-${i}`, fallbacks, editorBlocks)}
              </div>
            </div>
          ))}
        </div>
      );
    case 'blockquote':
      return (
        <blockquote className="my-2.5 pl-3 border-l-[3px] border-[#707579]/40 text-[16px] text-[#000000] leading-[1.45]">
          {renderNestedBlocks(block.blocks, 'bq', fallbacks, editorBlocks)}
        </blockquote>
      );
    case 'pullquote':
      return (
        <blockquote className="my-3 py-3 px-3 border-l-[3px] border-[#3390ec] bg-[#3390ec]/[0.06] text-center rounded-r-lg">
          <p className="text-[16px] font-medium italic text-[#000000] leading-snug">
            {renderTelegramRichText(block.text)}
          </p>
          {block.credit != null && (
            <p className="text-[13px] text-[#707579] mt-2 not-italic">
              — {renderTelegramRichText(block.credit)}
            </p>
          )}
        </blockquote>
      );
    case 'table': {
      const cells = block.cells;
      if (!cells?.length) return null;
      const alignClass = (a?: string) =>
        a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';
      const valignClass = (v?: string) =>
        v === 'middle' ? 'align-middle' : v === 'bottom' ? 'align-bottom' : 'align-top';
      const firstRowHeader = (cells[0] ?? []).some((c) => c.is_header);
      const headerRow = firstRowHeader ? cells[0] : null;
      const bodyRows = firstRowHeader ? cells.slice(1) : cells;
      const striped = !!block.is_striped;
      return (
        <div className="my-2.5">
          <div className="overflow-x-auto rounded-lg border border-black/10">
            <table className="w-full text-[14px]">
              {headerRow && (
                <thead>
                  <tr className="bg-black/[0.04]">
                    {headerRow.map((cell, i) => (
                      <th
                        key={i}
                        colSpan={cell.colspan}
                        rowSpan={cell.rowspan}
                        className={`px-3 py-2 font-semibold text-[#000000] border-b border-black/10 ${alignClass(cell.align)}`}
                      >
                        {renderTelegramRichText(cell.text)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`border-b border-black/[0.06] last:border-0 ${
                      striped && ri % 2 === 1 ? 'bg-black/[0.02]' : ''
                    }`}
                  >
                    {row.map((cell, ci) =>
                      cell.is_header ? (
                        <th
                          key={ci}
                          colSpan={cell.colspan}
                          rowSpan={cell.rowspan}
                          className={`px-3 py-2 font-semibold text-[#000000] ${alignClass(cell.align)} ${valignClass(cell.valign)}`}
                        >
                          {renderTelegramRichText(cell.text)}
                        </th>
                      ) : (
                        <td
                          key={ci}
                          colSpan={cell.colspan}
                          rowSpan={cell.rowspan}
                          className={`px-3 py-2 text-[#000000] ${alignClass(cell.align)} ${valignClass(cell.valign)}`}
                        >
                          {renderTelegramRichText(cell.text)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption != null && (
            <p className="text-[13px] text-[#707579] mt-1.5 text-center px-1">
              {renderTelegramRichText(block.caption as unknown as TelegramRichText)}
            </p>
          )}
        </div>
      );
    }
    case 'pre':
      return (
        <div className="my-2.5">
          {block.language && (
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#707579] mb-1 px-1">
              {String(block.language)}
            </p>
          )}
          <pre className="rounded-lg bg-[#1b1f23] text-[#e8e8e8] p-3 text-[13px] font-mono overflow-x-auto leading-relaxed">
            <code>{typeof block.text === 'string' ? block.text : renderTelegramRichText(block.text)}</code>
          </pre>
        </div>
      );
    case 'mathematical_expression':
      return (
        <div className="my-2.5 rounded-lg bg-black/[0.04] px-3 py-2.5 text-center font-mono text-[15px] text-[#000000]">
          {block.expression}
        </div>
      );
    case 'details':
      return (
        <details
          open={!!block.is_open}
          className="my-2.5 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2"
        >
          <summary className="cursor-pointer font-semibold text-[15px] text-[#3390ec] list-none [&::-webkit-details-marker]:hidden">
            {renderTelegramRichText(block.summary) || 'Подробнее'}
          </summary>
          <div className="mt-2">
            {renderNestedBlocks(block.blocks, 'det', fallbacks, editorBlocks)}
          </div>
        </details>
      );
    case 'photo': {
      const fb = shiftMedia(fallbacks);
      return renderMediaPreview(fb ? { ...fb, kind: 'photo' } : undefined, block.caption?.text, block.caption?.credit);
    }
    case 'video': {
      const fb = shiftMedia(fallbacks);
      return renderMediaPreview(fb ? { ...fb, kind: 'video' } : undefined, block.caption?.text, block.caption?.credit);
    }
    case 'animation': {
      const fb = shiftMedia(fallbacks);
      return renderMediaPreview(fb ? { ...fb, kind: 'animation' } : undefined, block.caption?.text, block.caption?.credit);
    }
    case 'audio': {
      const fb = shiftMedia(fallbacks);
      return renderMediaPreview(fb ? { ...fb, kind: 'audio' } : undefined, block.caption?.text, block.caption?.credit);
    }
    case 'voice_note': {
      const fb = shiftMedia(fallbacks);
      return renderMediaPreview(fb ? { ...fb, kind: 'voice' } : undefined, block.caption?.text, block.caption?.credit);
    }
    case 'collage':
    case 'slideshow':
      return (
        <figure className="my-2.5">
          <div
            className={`grid gap-0.5 rounded-lg overflow-hidden ${
              block.type === 'slideshow' ? 'grid-cols-1' : 'grid-cols-2'
            }`}
          >
            {block.blocks?.map((child, i) => (
              <div key={i} className="min-h-[80px] bg-black/[0.04]">
                <TelegramBlock block={child} fallbacks={fallbacks} editorBlocks={editorBlocks} />
              </div>
            ))}
          </div>
          {block.caption?.text != null && (
            <figcaption className="text-[13px] text-[#707579] mt-1.5 text-center px-1">
              {renderTelegramRichText(block.caption.text)}
            </figcaption>
          )}
        </figure>
      );
    case 'map': {
      const map = fallbacks.current.maps.shift();
      const lat = map?.lat ?? String(block.location?.latitude ?? '');
      const lon = map?.lon ?? String(block.location?.longitude ?? '');
      const zoom = map?.zoom ?? String(block.zoom ?? 14);
      const caption =
        map?.caption
        ?? (typeof block.caption?.text === 'string' ? block.caption.text : undefined);
      if (!lat || !lon || Math.abs(Number(lon)) < 0.001) return null;
      return (
        <MapBlockPreview
          lat={lat}
          lon={lon}
          zoom={zoom}
          caption={caption}
          fromTelegram
        />
      );
    }
    case 'divider':
      return <hr className="my-3 border-0 border-t border-black/10" />;
    case 'footer':
      return (
        <p className="mt-3 pt-2.5 border-t border-black/[0.08] text-[13px] text-[#707579] text-center leading-snug">
          {renderTelegramRichText(block.text)}
        </p>
      );
    default:
      return null;
  }
}

type TelegramRichPreviewProps = {
  blocks: TelegramRichBlock[];
  editorBlocks: RichPostBlock[];
  className?: string;
};

/** Превью по блокам из ответа Telegram (после «Себе»). */
export function TelegramRichPreview({ blocks, editorBlocks, className = '' }: TelegramRichPreviewProps) {
  const fallbacksRef = useRef<MediaFallbacks>({ media: [], maps: [] });
  fallbacksRef.current = collectMediaFallbacks(editorBlocks);

  if (!blocks.length) {
    return (
      <p className={`text-[15px] text-[#707579] text-center py-8 ${className}`}>Нет блоков</p>
    );
  }

  return (
    <div className={className}>
      {blocks.map((block, i) => (
        <TelegramBlock
          key={i}
          block={block}
          fallbacks={fallbacksRef}
          editorBlocks={editorBlocks}
        />
      ))}
    </div>
  );
}

export default TelegramRichPreview;
