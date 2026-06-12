import React, { useState } from 'react';
import type { TelegramRichText } from '../data/telegramRichTypes';
import { TG_LINK_CLASS } from './renderInlineMarkdown';

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
    >
      {children}
    </span>
  );
}

type RichNode = Exclude<TelegramRichText, string | TelegramRichText[]>;

function formatDateTime(node: RichNode): string | null {
  const unix = typeof node.unix_time === 'number' ? node.unix_time : undefined;
  if (unix == null) return null;
  try {
    return new Date(unix * 1000).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function renderRichTextNode(node: TelegramRichText, key: number): React.ReactNode {
  if (node == null) return null;
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    return node.map((part, i) => (
      <React.Fragment key={`${key}-${i}`}>{renderRichTextNode(part, key + i + 1)}</React.Fragment>
    ));
  }

  const text = node.text;
  const inner = text != null ? renderRichTextNode(text, key + 1) : null;

  switch (node.type) {
    case 'bold':
      return (
        <strong key={key} className="font-semibold">
          {inner}
        </strong>
      );
    case 'italic':
      return (
        <em key={key} className="italic">
          {inner}
        </em>
      );
    case 'underline':
      return (
        <span key={key} className="underline">
          {inner}
        </span>
      );
    case 'strikethrough':
      return (
        <span key={key} className="line-through text-slate-500">
          {inner}
        </span>
      );
    case 'spoiler':
      return <TelegramSpoiler key={key}>{inner}</TelegramSpoiler>;
    case 'code':
      return (
        <code
          key={key}
          className="px-1 py-0.5 rounded bg-black/[0.06] text-[0.92em] font-mono text-slate-800"
        >
          {inner}
        </code>
      );
    case 'marked':
      return (
        <mark key={key} className="bg-[#ffe066]/70 px-0.5 rounded-sm">
          {inner}
        </mark>
      );
    case 'subscript':
      return <sub key={key}>{inner}</sub>;
    case 'superscript':
      return <sup key={key}>{inner}</sup>;
    case 'custom_emoji': {
      const alt = typeof node.alternative_text === 'string' ? node.alternative_text : '🙂';
      return (
        <span key={key} title="custom emoji">
          {alt}
        </span>
      );
    }
    case 'mathematical_expression': {
      const expr = typeof node.expression === 'string' ? node.expression : '';
      return (
        <span key={key} className="font-mono text-[0.95em] text-[#000000]">
          {expr || inner}
        </span>
      );
    }
    case 'date_time': {
      const formatted = formatDateTime(node);
      return <span key={key}>{formatted ?? inner}</span>;
    }
    // Кликабельные сущности — цвет ссылки, как в Telegram
    case 'url':
    case 'mention':
    case 'text_mention':
    case 'email_address':
    case 'phone_number':
    case 'bank_card_number':
    case 'hashtag':
    case 'cashtag':
    case 'bot_command':
    case 'anchor_link':
      return (
        <span key={key} className={TG_LINK_CLASS}>
          {inner}
        </span>
      );
    case 'reference':
    case 'reference_link':
      return (
        <sup key={key} className={`${TG_LINK_CLASS} text-[0.75em]`}>
          {inner}
        </sup>
      );
    case 'anchor':
      // Невидимый якорь — цель для ссылок внутри сообщения
      return null;
    default:
      return inner ?? null;
  }
}

/** Рендер RichText из Telegram API (как в клиенте после sendRichMessage). */
export function renderTelegramRichText(text: TelegramRichText | undefined): React.ReactNode {
  if (text == null) return null;
  return renderRichTextNode(text, 0);
}
