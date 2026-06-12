import type { MediaItem, RichPostBlock, TableAlign } from '../data/richPostModel';
import { getColumnAlign, getListItemMarker, getListItemStyle } from '../data/richPostModel';
import { resolveMediaUrl } from './resolveMediaUrl';

function headingPrefix(level: number): string {
  return '#'.repeat(Math.min(Math.max(level, 1), 6)) + ' ';
}

/** Экранирование для HTML-атрибутов и текста (Telegram поддерживает именованные сущности) */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function effectiveMediaKind(item: MediaItem): MediaItem['kind'] {
  const kind = item.kind ?? 'photo';
  const u = item.url.trim().toLowerCase();
  if (kind === 'photo') {
    if (/\.(mp3|m4a|wav)(\?|$)/.test(u)) return 'audio';
    if (/\.(webm|ogg|oga|opus)(\?|$)/.test(u)) return 'voice';
  }
  return kind;
}

function mediaMarkdown(item: MediaItem, caption?: string): string {
  const url = resolveMediaUrl(item.url.trim());
  if (!url) return '';
  const cap = (caption ?? '').trim();
  const kind = effectiveMediaKind(item);

  if (kind === 'voice' || kind === 'audio') {
    const capEsc = cap.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return cap ? `![](${url} "${capEsc}")` : `![](${url})`;
  }

  return cap ? `![](${url} "${cap.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")` : `![](${url})`;
}

/** Одиночное медиа с подписью и автором (credit) — credit возможен только через HTML <figure>. */
function singleMediaMarkdown(item: MediaItem, caption: string, credit: string): string {
  const url = resolveMediaUrl(item.url.trim());
  if (!url) return '';
  const cap = caption.trim();
  const cr = credit.trim();
  const kind = effectiveMediaKind(item);

  if (kind === 'voice' || kind === 'audio') {
    const capText = [cap, cr].filter(Boolean).join(' · ');
    return mediaMarkdown({ ...item, kind }, capText);
  }

  if (!cr) return mediaMarkdown(item, cap);
  const capInner = `${escapeHtml(cap)}<cite>${escapeHtml(cr)}</cite>`;
  return `<figure><img src="${escapeHtml(url)}"><figcaption>${capInner}</figcaption></figure>`;
}

function mediaGroupMarkdown(items: MediaItem[]): string {
  const lines = items
    .map((item) => mediaMarkdown(item))
    .filter(Boolean);
  if (!lines.length) return '';
  return lines.join('\n');
}

function collageMarkdown(
  tag: 'tg-collage' | 'tg-slideshow',
  items: MediaItem[],
  caption: string,
  credit: string,
): string {
  const inner = mediaGroupMarkdown(items);
  if (!inner) return '';
  const cap = caption.trim();
  const cr = credit.trim();
  const fig =
    cap || cr
      ? `\n<figure><figcaption>${escapeHtml(cap)}${cr ? `<cite>${escapeHtml(cr)}</cite>` : ''}</figcaption></figure>`
      : '';
  return `<${tag}>\n${inner}${fig}\n</${tag}>`;
}

/** Строка-разделитель markdown-таблицы с учётом выравнивания колонок. */
function tableDelimiter(align: TableAlign): string {
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  return ':---';
}

export function richBlocksToMarkdown(blocks: RichPostBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        if (block.text.trim()) parts.push(`${headingPrefix(block.level)}${block.text.trim()}`);
        break;
      case 'paragraph':
        if (block.text.trim()) parts.push(block.text.trim());
        break;
      case 'list':
        if (block.items.length) {
          parts.push(
            block.items
              .map((item) => {
                if (item.task) {
                  return `- [${item.checked ? 'x' : ' '}] ${item.text}`;
                }
                if (getListItemStyle(item, block.ordered) === 'number') {
                  return `1. ${item.text}`;
                }
                return `- ${item.text}`;
              })
              .join('\n'),
          );
        }
        break;
      case 'table': {
        const keep = block.headers.map((h, i) => ({ h, i })).filter((c) => c.h.trim() !== '' || block.rows.some((r) => (r[c.i] ?? '').trim() !== ''));
        const cols = keep.length ? keep : block.headers.map((h, i) => ({ h, i }));
        if (!cols.length) break;
        const align = cols.map((c) => tableDelimiter(getColumnAlign(block.aligns, c.i)));
        const rows = block.rows.map((row) =>
          cols.map((c) => (row[c.i] ?? '').trim()).join(' | '),
        );
        parts.push(
          [
            `| ${cols.map((c) => c.h).join(' | ')} |`,
            `| ${align.join(' | ')} |`,
            ...rows.map((r) => `| ${r} |`),
          ].join('\n'),
        );
        break;
      }
      case 'quote':
        if (block.pull && block.text.trim()) {
          const cite = block.credit.trim() ? `<cite>${block.credit.trim()}</cite>` : '';
          parts.push(`<aside>${block.text.trim()}${cite}</aside>`);
        } else if (block.text.trim()) {
          parts.push(block.text.trim().split('\n').map((l) => `> ${l}`).join('\n'));
        }
        break;
      case 'code':
        if (block.code.trim()) {
          const lang = block.language.trim() || 'text';
          parts.push('```' + lang + '\n' + block.code.trim() + '\n```');
        }
        break;
      case 'math':
        if (block.expression.trim()) {
          parts.push('```math\n' + block.expression.trim() + '\n```');
        }
        break;
      case 'details': {
        const openAttr = block.open ? ' open' : '';
        parts.push(
          `<details${openAttr}>\n<summary>${block.summary.trim() || 'Details'}</summary>\n\n${block.body.trim()}\n\n</details>`,
        );
        break;
      }
      case 'media':
        if (block.url.trim()) {
          parts.push(
            singleMediaMarkdown(
              { url: block.url, kind: block.kind },
              block.caption,
              block.credit ?? '',
            ),
          );
        }
        break;
      case 'collage': {
        const md = collageMarkdown('tg-collage', block.items, block.caption, block.credit ?? '');
        if (md) parts.push(md);
        break;
      }
      case 'slideshow': {
        const md = collageMarkdown('tg-slideshow', block.items, block.caption, block.credit ?? '');
        if (md) parts.push(md);
        break;
      }
      case 'map':
        parts.push(
          `<tg-map lat="${block.lat.trim()}" lon="${block.lon.trim()}" zoom="${block.zoom.trim() || '14'}" width="360" height="160">\n<figure><figcaption>${block.caption.trim() || 'Карта'}</figcaption></figure>\n</tg-map>`,
        );
        break;
      case 'divider':
        parts.push('---');
        break;
      case 'footer':
        if (block.text.trim()) parts.push(`<footer>${block.text.trim()}</footer>`);
        break;
    }
  }

  return parts.join('\n\n').trim();
}
