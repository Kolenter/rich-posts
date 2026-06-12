import React, { useState } from 'react';

export const TG_LINK_CLASS = 'text-[#3390ec] underline decoration-[#3390ec]/40 underline-offset-2';

function TelegramSpoiler({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setOpen(true);
      }}
      className={`inline rounded-[3px] px-0.5 cursor-pointer transition-all ${
        open ? 'bg-black/[0.06] text-inherit' : 'bg-[#848484] text-[#848484] select-none'
      }`}
      title={open ? undefined : 'Спойлер — нажмите'}
    >
      {children}
    </span>
  );
}

type ParseState = { key: number };

function parseInline(text: string, state: ParseState): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;

  const plainUntil = (from: number): number => {
    let j = from;
    while (j < text.length) {
      const c = text[j];
      if (
        c === '*'
        || c === '_'
        || c === '`'
        || c === '|'
        || c === '['
        || c === '<'
        || c === '='
        || c === '~'
        || c === '$'
        || c === '!'
      ) {
        break;
      }
      j++;
    }
    return j;
  };

  const tryDelimited = (
    open: string,
    close: string,
    render: (inner: React.ReactNode[], k: number) => React.ReactNode,
    parseInner: (s: string) => React.ReactNode[] = (s) => parseInline(s, state),
  ): React.ReactNode | null => {
    if (!text.startsWith(open, i)) return null;
    const start = i + open.length;
    const end = text.indexOf(close, start);
    if (end < 0) return null;
    const innerText = text.slice(start, end);
    if (!innerText && open !== '<a name="') return null;
    const inner = parseInner(innerText);
    const node = render(inner, state.key++);
    i = end + close.length;
    return node;
  };

  while (i < text.length) {
    if (text.startsWith('![', i)) {
      const closeBracket = text.indexOf('](', i + 2);
      const closeParen = closeBracket >= 0 ? text.indexOf(')', closeBracket + 2) : -1;
      if (closeBracket >= 0 && closeParen >= 0) {
        const alt = text.slice(i + 2, closeBracket);
        const url = text.slice(closeBracket + 2, closeParen);
        if (url.startsWith('tg://emoji')) {
          nodes.push(
            <span key={state.key++} title="custom emoji">
              {alt || '🙂'}
            </span>,
          );
        } else if (url.startsWith('tg://time')) {
          nodes.push(
            <span key={state.key++} className="text-[#3390ec]">
              {alt || 'дата'}
            </span>,
          );
        } else {
          nodes.push(alt || '');
        }
        i = closeParen + 1;
        continue;
      }
    }

    if (text.startsWith('[^', i)) {
      const end = text.indexOf(']', i + 2);
      if (end > i) {
        nodes.push(
          <sup key={state.key++} className={`${TG_LINK_CLASS} text-[0.7em]`}>
            {text.slice(i + 2, end)}
          </sup>,
        );
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith('[', i) && !text.startsWith('[^', i)) {
      const closeBracket = text.indexOf('](', i + 1);
      const closeParen = closeBracket >= 0 ? text.indexOf(')', closeBracket + 2) : -1;
      if (closeBracket > i && closeParen >= 0) {
        const label = text.slice(i + 1, closeBracket);
        nodes.push(
          <span key={state.key++} className={TG_LINK_CLASS}>
            {parseInline(label, state)}
          </span>,
        );
        i = closeParen + 1;
        continue;
      }
    }

    if (text.startsWith('<a name="', i)) {
      const end = text.indexOf('></a>', i);
      if (end >= 0) {
        i = end + 6;
        continue;
      }
    }

    const delimited =
      tryDelimited('**', '**', (inner, k) => (
        <strong key={k} className="font-semibold">
          {inner}
        </strong>
      ))
      ?? tryDelimited('__', '__', (inner, k) => (
        <strong key={k} className="font-semibold">
          {inner}
        </strong>
      ))
      ?? tryDelimited('~~', '~~', (inner, k) => (
        <span key={k} className="line-through text-slate-500">
          {inner}
        </span>
      ))
      ?? tryDelimited('==', '==', (inner, k) => (
        <mark key={k} className="bg-[#ffe066]/70 px-0.5 rounded-sm">
          {inner}
        </mark>
      ))
      ?? tryDelimited('||', '||', (inner, k) => <TelegramSpoiler key={k}>{inner}</TelegramSpoiler>)
      ?? tryDelimited('`', '`', (inner, k) => (
        <code
          key={k}
          className="px-1 py-0.5 rounded bg-black/[0.06] text-[0.92em] font-mono text-slate-800"
        >
          {inner}
        </code>
      ), (s) => [s])
      ?? tryDelimited('$', '$', (inner, k) => (
        <span key={k} className="font-mono text-[0.95em]">
          {inner}
        </span>
      ), (s) => [s])
      ?? tryDelimited('<u>', '</u>', (inner, k) => (
        <span key={k} className="underline">
          {inner}
        </span>
      ))
      ?? tryDelimited('<sub>', '</sub>', (inner, k) => <sub key={k}>{inner}</sub>)
      ?? tryDelimited('<sup>', '</sup>', (inner, k) => <sup key={k}>{inner}</sup>);

    if (delimited) {
      nodes.push(delimited);
      continue;
    }

    // _курсив_ — одиночное подчёркивание (не __)
    if (text[i] === '_' && text[i + 1] !== '_') {
      const end = text.indexOf('_', i + 1);
      if (end > i + 1) {
        const innerText = text.slice(i + 1, end);
        nodes.push(
          <em key={state.key++} className="italic">
            {parseInline(innerText, state)}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }

    const next = plainUntil(i);
    if (next > i) {
      nodes.push(text.slice(i, next));
      i = next;
    } else {
      nodes.push(text[i]);
      i++;
    }
  }

  return nodes;
}

/** Inline-рендер с поддержкой вложенного форматирования (как в Telegram Rich Message). */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes = parseInline(text, { key: 0 });
  return nodes.length ? nodes : [text];
}

export type InlineWrap = { before: string; after: string; id: string };

/** Маркеры inline-форматирования для обёртки выделения. */
export const INLINE_WRAPS: InlineWrap[] = [
  { id: 'bold', before: '**', after: '**' },
  { id: 'italic', before: '_', after: '_' },
  { id: 'underline', before: '<u>', after: '</u>' },
  { id: 'strike', before: '~~', after: '~~' },
  { id: 'mark', before: '==', after: '==' },
  { id: 'spoiler', before: '||', after: '||' },
  { id: 'code', before: '`', after: '`' },
];

/** Обёрнуть выделение; если уже обёрнуто тем же маркером — снять. Иначе добавить снаружи (вложенность). */
export function wrapInlineText(
  value: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
): { next: string; selStart: number; selEnd: number } {
  const start = selStart;
  const end = selEnd;
  const selected = value.slice(start, end) || 'текст';

  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const inner = selected.slice(before.length, selected.length - after.length);
    const next = value.slice(0, start) + inner + value.slice(end);
    return { next, selStart: start, selEnd: start + inner.length };
  }

  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  const innerStart = start + before.length;
  const innerEnd = innerStart + selected.length;
  if (before === '[' && after === '](https://)') {
    return { next, selStart: innerStart + selected.length + '](https://'.length, selEnd: innerStart + selected.length + '](https://'.length };
  }
  return { next, selStart: innerStart, selEnd: innerEnd };
}
