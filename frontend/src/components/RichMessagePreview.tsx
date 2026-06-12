import React from 'react';
import type { MediaItem, RichPostBlock } from '../data/richPostModel';
import type { TelegramRichBlock } from '../data/telegramRichTypes';
import { getColumnAlign, getListItemMarker, type ButtonRow } from '../data/richPostModel';
import { MEDIA_KIND_LABELS } from '../utils/mediaKind';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';
import { renderInlineMarkdown } from '../utils/renderInlineMarkdown';
import { MapBlockPreview } from './MapBlockPreview';
import { TelegramRichPreview } from './TelegramRichPreview';

const HEADING_TAG: Record<1 | 2 | 3 | 4 | 5 | 6, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

const HEADING_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'text-[22px] font-bold leading-tight text-[#000000] mb-2 mt-1',
  2: 'text-[19px] font-bold leading-snug text-[#000000] mb-2 mt-1',
  3: 'text-[17px] font-semibold leading-snug text-[#000000] mb-1.5 mt-1',
  4: 'text-[16px] font-semibold leading-snug text-[#000000] mb-1.5 mt-1',
  5: 'text-[15px] font-semibold text-[#000000] mb-1 mt-1',
  6: 'text-[14px] font-semibold text-[#000000] mb-1 mt-1',
};

function MediaPreviewItem({ item, caption }: { item: MediaItem; caption?: string }) {
  if (!item.url.trim()) return null;
  const url = resolveMediaUrl(item.url);
  return (
    <>
      {item.kind === 'photo' && (
        <img
          src={url}
          alt={caption || ''}
          className="w-full rounded-lg max-h-64 object-cover bg-black/[0.04]"
          loading="lazy"
        />
      )}
      {item.kind === 'video' && (
        <video src={url} controls className="w-full rounded-lg max-h-64 bg-black" preload="metadata" />
      )}
      {item.kind === 'animation' && (
        <img src={url} alt="" className="w-full rounded-lg max-h-64 object-contain bg-black/[0.04]" loading="lazy" />
      )}
      {(item.kind === 'audio' || item.kind === 'voice') && (
        <div className="rounded-lg bg-black/[0.04] px-3 py-3">
          <p className="text-[11px] text-[#707579] mb-2">{MEDIA_KIND_LABELS[item.kind]}</p>
          <audio src={url} controls className="w-full" preload="metadata" />
        </div>
      )}
    </>
  );
}

function PreviewBlock({ block }: { block: RichPostBlock }) {
  switch (block.type) {
    case 'heading': {
      if (!block.text.trim()) return null;
      const Tag = HEADING_TAG[block.level];
      return (
        <Tag className={HEADING_CLASS[block.level]}>{renderInlineMarkdown(block.text.trim())}</Tag>
      );
    }
    case 'paragraph': {
      if (!block.text.trim()) return null;
      const fnDef = /^\s*\[\^([^\]]+)\]:\s*(.*)$/s.exec(block.text);
      if (fnDef) {
        return (
          <p className="text-[13px] leading-snug text-[#707579] mb-2 border-t border-black/[0.06] pt-1.5">
            <sup className="mr-1">{fnDef[1]}</sup>
            {renderInlineMarkdown(fnDef[2])}
          </p>
        );
      }
      return (
        <p className="text-[16px] leading-[1.45] text-[#000000] mb-2.5 whitespace-pre-wrap break-words">
          {renderInlineMarkdown(block.text)}
        </p>
      );
    }
    case 'list':
      if (!block.items.length) return null;
      return (
        <div className="mb-2.5 space-y-1.5 text-[16px] text-[#000000] leading-[1.45]">
          {block.items.map((item, i) => (
            <div
              key={i}
              className={`flex gap-2 items-start ${item.task ? 'pl-0' : 'pl-0.5'}`}
            >
              {item.task ? (
                <span
                  className={`mt-1 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${
                    item.checked ? 'bg-[#3390ec] border-[#3390ec] text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {item.checked ? '✓' : ''}
                </span>
              ) : (
                <span className="w-5 shrink-0 text-right text-[#707579] tabular-nums pt-0.5">
                  {getListItemMarker(block.items, i, block.ordered)}
                </span>
              )}
              <span className={`flex-1 min-w-0 break-words ${item.checked ? 'line-through text-slate-400' : ''}`}>
                {renderInlineMarkdown(item.text)}
              </span>
            </div>
          ))}
        </div>
      );
    case 'quote':
      if (!block.text.trim()) return null;
      if (block.pull) {
        return (
          <blockquote className="my-3 py-3 px-3 border-l-[3px] border-[#3390ec] bg-[#3390ec]/[0.06] text-center rounded-r-lg">
            <p className="text-[16px] font-medium italic text-[#000000] leading-snug">
              {renderInlineMarkdown(block.text)}
            </p>
            {block.credit && (
              <p className="text-[13px] text-[#707579] mt-2 not-italic">— {block.credit}</p>
            )}
          </blockquote>
        );
      }
      return (
        <blockquote className="my-2.5 pl-3 border-l-[3px] border-[#707579]/40 text-[16px] text-[#000000] leading-[1.45]">
          {renderInlineMarkdown(block.text)}
        </blockquote>
      );
    case 'table': {
      if (!block.headers.some((h) => h.trim())) return null;
      const alignClass = (i: number) => {
        const a = getColumnAlign(block.aligns, i);
        return a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';
      };
      return (
        <div className="my-2.5 overflow-x-auto rounded-lg border border-black/10">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-black/[0.04]">
                {block.headers.map((h, i) => (
                  <th
                    key={i}
                    className={`px-3 py-2 font-semibold text-[#000000] border-b border-black/10 ${alignClass(i)}`}
                  >
                    {renderInlineMarkdown(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={`border-b border-black/[0.06] last:border-0 ${ri % 2 === 1 ? 'bg-black/[0.02]' : ''}`}
                >
                  {block.headers.map((_, ci) => (
                    <td key={ci} className={`px-3 py-2 text-[#000000] align-top ${alignClass(ci)}`}>
                      {renderInlineMarkdown(row[ci] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'code':
      if (!block.code.trim()) return null;
      return (
        <div className="my-2.5">
          {block.language.trim() && (
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#707579] mb-1 px-1">
              {block.language.trim()}
            </p>
          )}
          <pre className="rounded-lg bg-[#1b1f23] text-[#e8e8e8] p-3 text-[13px] font-mono overflow-x-auto leading-relaxed">
            <code>{block.code}</code>
          </pre>
        </div>
      );
    case 'math':
      if (!block.expression.trim()) return null;
      return (
        <div className="my-2.5 rounded-lg bg-black/[0.04] px-3 py-2.5 text-center font-mono text-[15px] text-[#000000]">
          {block.expression}
        </div>
      );
    case 'details':
      return (
        <details
          open={block.open}
          className="my-2.5 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2"
        >
          <summary className="cursor-pointer font-semibold text-[15px] text-[#3390ec] list-none [&::-webkit-details-marker]:hidden">
            {block.summary || 'Подробнее'}
          </summary>
          <p className="mt-2 text-[16px] text-[#000000] leading-[1.45] whitespace-pre-wrap break-words">
            {renderInlineMarkdown(block.body)}
          </p>
        </details>
      );
    case 'media':
      if (!block.url.trim()) return null;
      return (
        <figure className="my-2.5 -mx-0.5">
          <MediaPreviewItem item={{ url: block.url, kind: block.kind }} caption={block.caption} />
          {(block.caption || (block.credit ?? '').trim()) && (
            <figcaption className="text-[13px] text-[#707579] mt-1.5 text-center px-1">
              {block.caption}
              {(block.credit ?? '').trim() && (
                <cite className="not-italic text-[#9aa0a6] ml-1">· {block.credit}</cite>
              )}
            </figcaption>
          )}
        </figure>
      );
    case 'collage':
    case 'slideshow': {
      const items = block.items.filter((i) => i.url.trim());
      if (!items.length && !block.caption.trim() && !(block.credit ?? '').trim()) return null;
      return (
        <figure className="my-2.5">
          <div
            className={`grid gap-0.5 rounded-lg overflow-hidden ${
              block.type === 'slideshow' ? 'grid-cols-1' : 'grid-cols-2'
            }`}
          >
            {items.map((item, i) => (
              <div key={i}>
                <MediaPreviewItem item={item} />
              </div>
            ))}
          </div>
          {(block.caption || (block.credit ?? '').trim()) && (
            <figcaption className="text-[13px] text-[#707579] mt-1.5 text-center px-1">
              {block.caption}
              {(block.credit ?? '').trim() && (
                <cite className="not-italic text-[#9aa0a6] ml-1">· {block.credit}</cite>
              )}
            </figcaption>
          )}
        </figure>
      );
    }
    case 'map': {
      const lat = block.lat.trim();
      const lon = block.lon.trim();
      if (!lat || !lon) return null;
      return (
        <MapBlockPreview lat={lat} lon={lon} zoom={block.zoom} caption={block.caption} />
      );
    }
    case 'divider':
      return <hr className="my-3 border-0 border-t border-black/10" />;
    case 'footer':
      if (!block.text.trim()) return null;
      return (
        <p className="mt-3 pt-2.5 border-t border-black/[0.08] text-[13px] text-[#707579] text-center leading-snug">
          {renderInlineMarkdown(block.text)}
        </p>
      );
    default:
      return null;
  }
}

const BUTTON_STYLE_CLASS: Record<string, string> = {
  primary: 'bg-[#3390ec] text-white',
  success: 'bg-[#4dad51] text-white',
  danger: 'bg-[#e0533d] text-white',
  default: 'bg-white/90 text-[#3390ec]',
};

function MessageButtons({ rows }: { rows: ButtonRow[] }) {
  const keyboard = rows
    .map((row) => row.buttons.filter((b) => b.text.trim() && b.url.trim()))
    .filter((row) => row.length > 0);
  if (!keyboard.length) return null;
  return (
    <div className="mt-1 space-y-1">
      {keyboard.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((btn) => (
            <div
              key={btn.id}
              className={`flex-1 rounded-lg px-2 py-2 text-center text-[13px] font-semibold truncate shadow-sm ${
                BUTTON_STYLE_CLASS[btn.style ?? 'default']
              }`}
            >
              {btn.emojiId?.trim() ? '🙂 ' : ''}
              {btn.text.trim()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type RichMessagePreviewProps = {
  blocks: RichPostBlock[];
  buttons?: ButtonRow[];
  telegramBlocks?: TelegramRichBlock[] | null;
  telegramMarkdown?: string | null;
  markdown?: string;
  className?: string;
};

/** Превью в стиле пузыря сообщения Telegram (Rich Message). */
export function RichMessagePreview({
  blocks,
  buttons = [],
  telegramBlocks,
  telegramMarkdown,
  markdown,
  className = '',
}: RichMessagePreviewProps) {
  const useTelegram =
    !!telegramBlocks?.length &&
    !!telegramMarkdown &&
    !!markdown &&
    telegramMarkdown === markdown;
  const visible = blocks.filter((b) => {
    if (b.type === 'divider') return true;
    if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'footer') {
      return 'text' in b && !!b.text.trim();
    }
    if (b.type === 'list') return b.items.some((i) => i.text.trim());
    if (b.type === 'media') return !!b.url.trim();
    if (b.type === 'collage' || b.type === 'slideshow') {
      return b.items.some((i) => i.url.trim()) || !!b.caption.trim();
    }
    if (b.type === 'map') return !!b.lat.trim() && !!b.lon.trim();
    if (b.type === 'code') return !!b.code.trim();
    if (b.type === 'math') return !!b.expression.trim();
    if (b.type === 'details') return !!b.summary.trim() || !!b.body.trim();
    if (b.type === 'quote') return !!b.text.trim();
    if (b.type === 'table') return b.headers.some((h) => h.trim());
    return true;
  });

  return (
    <div className={className}>
      <div className="rounded-2xl bg-[#dfe6eb] p-2.5">
        <div className="rounded-2xl rounded-tl-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="px-3.5 py-3 max-h-[70vh] overflow-y-auto">
            {useTelegram ? (
              <TelegramRichPreview blocks={telegramBlocks!} editorBlocks={blocks} />
            ) : visible.length === 0 ? (
              <p className="text-[15px] text-[#707579] text-center py-8">Добавьте блоки</p>
            ) : (
              visible.map((block) => <PreviewBlock key={block.id} block={block} />)
            )}
          </div>
        </div>
        <MessageButtons rows={buttons} />
        <p className="text-[10px] text-[#707579] text-center mt-2 font-medium">
          {useTelegram
            ? 'Как в Telegram · после «Себе»'
            : 'Черновик · нажмите «Себе» для точного превью'}
        </p>
      </div>
    </div>
  );
}

export default RichMessagePreview;
