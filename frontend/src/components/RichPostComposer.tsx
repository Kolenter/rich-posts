import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Code,
  Eraser,
  Eye,
  GripVertical,
  Italic,
  Link2,
  Loader2,
  Megaphone,
  Plus,
  Send,
  Strikethrough,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { RichMessagePreview } from './RichMessagePreview';
import { MediaBlockEditor, MediaGroupEditor } from './MediaBlockEditor';
import { ButtonsEditor } from './ButtonsEditor';
import { EmojiPicker } from './EmojiPicker';
import { AutoTextarea } from './AutoTextarea';
import {
  ADD_BLOCK_KINDS,
  BLOCK_LABELS,
  blockHasContent,
  clearBlockContent,
  createBlock,
  EXTRA_BLOCK_KINDS,
  getColumnAlign,
  getListItemMarker,
  getListItemStyle,
  HEADING_INPUT_CLASS,
  type ButtonRow,
  type RichBlockKind,
  type RichPostBlock,
  type TableAlign,
} from '../data/richPostModel';
import type { TelegramRichBlock } from '../data/telegramRichTypes';
import { richBlocksToMarkdown } from '../utils/richBlocksToMarkdown';
import {
  detailsFieldsContainMath,
  markdownHasMathInsideDetails,
  MATH_IN_DETAILS_ERROR,
} from '../utils/tdesktopMathDetailsGuard';
import { wrapInlineText } from '../utils/renderInlineMarkdown';
import { blockIndexFromPoint, reorderBlocks } from '../utils/blockReorder';
import { useVirtualKeyboardOpen } from '../hooks/useVirtualKeyboardOpen';
import { useWideLayout } from '../hooks/useWideLayout';
import { RichMessagePreview } from './RichMessagePreview';

type RichPostComposerProps = {
  blocks: RichPostBlock[];
  onChange: (blocks: RichPostBlock[]) => void;
  buttons: ButtonRow[];
  onButtonsChange: (rows: ButtonRow[]) => void;
  channel: string;
  onChannelChange: (value: string) => void;
  botUsername?: string;
  charLimit: number;
  markdown: string;
  telegramBlocks?: TelegramRichBlock[] | null;
  telegramMarkdown?: string | null;
  onTelegramDraft: () => void;
  onPublish: () => void;
  sending: 'draft' | 'publish' | null;
  disabled?: boolean;
  initData?: string;
};

function FormatToolbar({ onApply }: { onApply: (before: string, after: string) => void }) {
  const btn = (title: string, onClick: () => void, content: React.ReactNode) => (
    <button
      type="button"
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
      onClick={onClick}
      className="shrink-0 w-8 h-8 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center active:scale-95 touch-manipulation overflow-hidden"
      title={title}
    >
      {content}
    </button>
  );

  return (
    <div className="flex flex-wrap gap-1">
      {btn('Жирный', () => onApply('**', '**'), <Bold className="w-3.5 h-3.5" strokeWidth={2.5} />)}
      {btn('Курсив', () => onApply('_', '_'), <Italic className="w-3.5 h-3.5" strokeWidth={2.5} />)}
      {btn('Подчёркнутый', () => onApply('<u>', '</u>'), <Underline className="w-3.5 h-3.5" strokeWidth={2.5} />)}
      {btn('Зачёркнутый', () => onApply('~~', '~~'), <Strikethrough className="w-3.5 h-3.5" strokeWidth={2.5} />)}
      {btn('Выделение', () => onApply('==', '=='), <span className="text-[10px] font-black">==</span>)}
      {btn(
        'Спойлер',
        () => onApply('||', '||'),
        <span className="text-[10px] font-black font-mono leading-none tracking-tighter">||</span>,
      )}
      {btn('Код', () => onApply('`', '`'), <Code className="w-3.5 h-3.5" strokeWidth={2.5} />)}
      {btn('Ссылка', () => onApply('[', '](https://)'), <Link2 className="w-3.5 h-3.5" strokeWidth={2.5} />)}
      {btn('Sub', () => onApply('<sub>', '</sub>'), <span className="text-[9px] font-bold">x₂</span>)}
      {btn('Sup', () => onApply('<sup>', '</sup>'), <span className="text-[9px] font-bold">x²</span>)}
      {btn('Формула', () => onApply('$', '$'), <span className="text-[11px] font-black italic">f</span>)}
    </div>
  );
}

/** Перечень `[^id]` уже использованных сносок, чтобы выдать следующий номер. */
function nextFootnoteId(value: string): number {
  const used = new Set<number>();
  for (const m of value.matchAll(/\[\^(\d+)\]/g)) used.add(Number(m[1]));
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function toUnixFormat(local: string): { unix: number; human: string } | null {
  if (!local) return null;
  const ts = new Date(local).getTime();
  if (!Number.isFinite(ts)) return null;
  const unix = Math.floor(ts / 1000);
  const human = new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return { unix, human };
}

type ExtrasPanelProps = {
  onInsert: (text: string) => void;
  onAppend: (text: string) => void;
  currentValue: string;
  initData?: string;
};

function ExtrasPanel({ onInsert, onAppend, currentValue, initData }: ExtrasPanelProps) {
  const [mode, setMode] = useState<null | 'emoji' | 'date' | 'anchor' | 'link'>(null);
  const [dateValue, setDateValue] = useState('');
  const [anchorName, setAnchorName] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkText, setLinkText] = useState('');

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded-md text-[11px] font-semibold ${
        active ? 'bg-[#517da2] text-white' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {label}
    </button>
  );

  const inputCls =
    'flex-1 min-w-0 rounded-md border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-[#517da2]/50';
  const okCls = 'px-2.5 py-1 rounded-md bg-[#517da2] text-white text-[11px] font-bold disabled:opacity-40';

  return (
    <div className="mt-1.5 rounded-lg bg-slate-50 border border-slate-100 p-2 space-y-2">
      <div className="flex flex-wrap gap-1">
        {chip('Эмодзи', mode === 'emoji', () => setMode(mode === 'emoji' ? null : 'emoji'))}
        {chip('Дата/время', mode === 'date', () => setMode(mode === 'date' ? null : 'date'))}
        {chip('Сноска', false, () => {
          const n = nextFootnoteId(currentValue);
          onInsert(`[^${n}]`);
          onAppend(`[^${n}]: определение сноски`);
        })}
        {chip('Якорь', mode === 'anchor', () => setMode(mode === 'anchor' ? null : 'anchor'))}
        {chip('Ссылка-якорь', mode === 'link', () => setMode(mode === 'link' ? null : 'link'))}
      </div>

      {mode === 'emoji' && (
        <EmojiPicker
          initData={initData}
          onPick={(s) => {
            onInsert(`![${s.emoji}](tg://emoji?id=${s.id})`);
            setMode(null);
          }}
        />
      )}

      {mode === 'date' && (
        <div className="flex gap-1.5 items-center">
          <input
            type="datetime-local"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className={inputCls}
          />
          <button
            type="button"
            disabled={!dateValue}
            onClick={() => {
              const d = toUnixFormat(dateValue);
              if (d) onInsert(`![${d.human}](tg://time?unix=${d.unix}&format=wDT)`);
              setMode(null);
            }}
            className={okCls}
          >
            OK
          </button>
        </div>
      )}

      {mode === 'anchor' && (
        <div className="flex gap-1.5 items-center">
          <input
            value={anchorName}
            onChange={(e) => setAnchorName(e.target.value.replace(/\s+/g, '-'))}
            placeholder="имя якоря (section-1)"
            className={inputCls}
          />
          <button
            type="button"
            disabled={!anchorName.trim()}
            onClick={() => {
              onInsert(`<a name="${anchorName.trim()}"></a>`);
              setMode(null);
            }}
            className={okCls}
          >
            OK
          </button>
        </div>
      )}

      {mode === 'link' && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <input
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="текст ссылки"
              className={inputCls}
            />
            <input
              value={linkName}
              onChange={(e) => setLinkName(e.target.value.replace(/\s+/g, '-'))}
              placeholder="имя якоря"
              className={inputCls}
            />
          </div>
          <button
            type="button"
            disabled={!linkName.trim() || !linkText.trim()}
            onClick={() => {
              onInsert(`[${linkText.trim()}](#${linkName.trim()})`);
              setMode(null);
            }}
            className={okCls}
          >
            Вставить ссылку
          </button>
        </div>
      )}
    </div>
  );
}

function FormatBar({
  value,
  onChange,
  minRows = 2,
  placeholder = 'Текст…',
  initData,
}: {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
  placeholder?: string;
  initData?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const savedSel = useRef({ start: 0, end: 0 });
  const pendingSel = useRef<{ start: number; end: number } | null>(null);

  const captureSelection = () => {
    const el = ref.current;
    if (!el) return;
    savedSel.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  useLayoutEffect(() => {
    if (pendingSel.current === null) return;
    const el = ref.current;
    if (!el) {
      pendingSel.current = null;
      return;
    }
    const { start, end } = pendingSel.current;
    pendingSel.current = null;
    el.focus({ preventScroll: false });
    try {
      el.setSelectionRange(start, end);
    } catch {
      /* iOS WebView */
    }
    savedSel.current = { start, end };
  }, [value]);

  const [extrasOpen, setExtrasOpen] = useState(false);

  const apply = (before: string, after: string) => {
    const el = ref.current;
    if (!el) return;

    let start = savedSel.current.start;
    let end = savedSel.current.end;
    if (document.activeElement === el) {
      start = el.selectionStart;
      end = el.selectionEnd;
    }

    const { next, selStart, selEnd } = wrapInlineText(value, start, end, before, after);
    pendingSel.current = { start: selStart, end: selEnd };
    onChange(next);
  };

  const insertAtCursor = (text: string) => {
    const el = ref.current;
    let start = savedSel.current.start;
    let end = savedSel.current.end;
    if (el && document.activeElement === el) {
      start = el.selectionStart;
      end = el.selectionEnd;
    }
    if (start > value.length || end > value.length) {
      start = value.length;
      end = value.length;
    }
    const next = value.slice(0, start) + text + value.slice(end);
    const pos = start + text.length;
    pendingSel.current = { start: pos, end: pos };
    onChange(next);
  };

  const appendText = (text: string) => {
    onChange(value.trimEnd() + (value.trim() ? '\n\n' : '') + text);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <FormatToolbar onApply={apply} />
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setExtrasOpen((v) => !v)}
          className={`shrink-0 h-8 px-2 rounded-md text-[11px] font-bold ${
            extrasOpen ? 'bg-[#517da2] text-white' : 'bg-slate-100 text-slate-500'
          }`}
          title="Ещё: эмодзи, дата, сноска, якорь"
        >
          Ещё
        </button>
      </div>
      {extrasOpen && (
        <ExtrasPanel
          onInsert={insertAtCursor}
          onAppend={appendText}
          currentValue={value}
          initData={initData}
        />
      )}
      <AutoTextarea
        ref={ref}
        value={value}
        onChange={onChange}
        onSelect={captureSelection}
        onKeyUp={captureSelection}
        onClick={captureSelection}
        onBlur={captureSelection}
        placeholder={placeholder}
        minRows={minRows}
        className="text-slate-800 py-1 mt-1.5"
      />
    </div>
  );
}

type ListBlock = Extract<RichPostBlock, { type: 'list' }>;

function ListBlockEditor({
  block,
  onUpdate,
}: {
  block: ListBlock;
  onUpdate: (block: ListBlock) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const fieldRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const savedSel = useRef({ start: 0, end: 0 });

  const safeIndex = Math.min(activeIndex, Math.max(block.items.length - 1, 0));

  const captureSelection = (index: number) => {
    const el = fieldRefs.current[index];
    if (!el) return;
    savedSel.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  };

  const updateItemText = (index: number, text: string) => {
    const items = [...block.items];
    items[index] = { ...items[index], text };
    onUpdate({ ...block, items });
  };

  const applyToActiveItem = (before: string, after: string) => {
    const index = safeIndex;
    const item = block.items[index];
    if (!item) return;

    const el = fieldRefs.current[index];
    let start = savedSel.current.start;
    let end = savedSel.current.end;
    if (el && document.activeElement === el) {
      start = el.selectionStart ?? start;
      end = el.selectionEnd ?? end;
    }

    const { next, selStart, selEnd } = wrapInlineText(item.text, start, end, before, after);
    updateItemText(index, next);
    requestAnimationFrame(() => {
      el?.focus();
      try {
        el?.setSelectionRange(selStart, selEnd);
      } catch {
        /* iOS WebView */
      }
      savedSel.current = { start: selStart, end: selEnd };
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 mb-1">
        <span className="text-[10px] text-slate-400 mr-1">Новые пункты:</span>
        <button
          type="button"
          onClick={() => onUpdate({ ...block, ordered: false })}
          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
            !block.ordered ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
          }`}
          title="Новые пункты — маркированные"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ ...block, ordered: true })}
          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
            block.ordered ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
          }`}
          title="Новые пункты — нумерованные"
        >
          1.
        </button>
        <button
          type="button"
          onClick={() =>
            onUpdate({
              ...block,
              items: [...block.items, { text: '', task: true, checked: false }],
            })
          }
          className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-500"
          title="Добавить задачу"
        >
          ☐
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mb-1.5 leading-snug">
        Нажмите • или 1. у строки — можно смешивать в одном списке
      </p>
      <p className="text-[10px] text-slate-400 mb-1.5 leading-snug">
        Форматирование (B, I, спойлер…) — к пункту, где стоит курсор
      </p>
      <div className="mb-2">
        <FormatToolbar onApply={applyToActiveItem} />
      </div>
      {block.items.map((item, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5 items-start">
          {item.task ? (
            <button
              type="button"
              aria-label="Отметить задачу"
              onClick={() => {
                const items = [...block.items];
                items[i] = { ...item, checked: !item.checked };
                onUpdate({ ...block, items });
              }}
              className={`mt-1 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${
                item.checked ? 'bg-[#517da2] border-[#517da2] text-white' : 'border-slate-300 bg-white'
              }`}
            >
              {item.checked ? '✓' : ''}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Переключить тип пункта"
              onClick={() => {
                const items = [...block.items];
                const cur = getListItemStyle(item, block.ordered);
                items[i] = { ...item, style: cur === 'bullet' ? 'number' : 'bullet' };
                onUpdate({ ...block, items });
              }}
              className="text-slate-400 mt-1.5 w-6 shrink-0 text-right text-sm tabular-nums hover:text-[#517da2] active:scale-95 touch-manipulation"
              title="Пункт ↔ цифра"
            >
              {getListItemMarker(block.items, i, block.ordered)}
            </button>
          )}
          <AutoTextarea
            ref={(el) => {
              fieldRefs.current[i] = el;
            }}
            value={item.text}
            onChange={(v) => updateItemText(i, v)}
            minRows={1}
            maxHeight={240}
            onFocus={() => {
              setActiveIndex(i);
              captureSelection(i);
            }}
            onSelect={() => captureSelection(i)}
            onKeyUp={() => captureSelection(i)}
            onClick={() => captureSelection(i)}
            onBlur={() => captureSelection(i)}
            placeholder="Пункт"
            className={`flex-1 min-w-0 border-0 border-b py-1 text-[15px] leading-snug focus:border-[#517da2]/40 ${
              safeIndex === i ? 'border-[#517da2]/30' : 'border-slate-100'
            }`}
          />
          <button
            type="button"
            aria-label={item.text.trim() ? 'Очистить пункт' : 'Удалить пункт'}
            onClick={() => {
              if (item.text.trim()) {
                updateItemText(i, '');
                return;
              }
              if (block.items.length > 1) {
                const items = block.items.filter((_, j) => j !== i);
                onUpdate({ ...block, items });
                setActiveIndex((prev) => Math.min(prev, items.length - 1));
              }
            }}
            className="text-slate-300 hover:text-[#517da2] p-1 shrink-0"
            title={item.text.trim() ? 'Очистить пункт' : 'Удалить пункт'}
          >
            {item.text.trim() ? <Eraser className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onUpdate({
            ...block,
            items: [...block.items, { text: '', style: block.ordered ? 'number' : 'bullet' }],
          })
        }
        className="text-[12px] font-semibold text-[#517da2] mt-1"
      >
        + пункт
      </button>
    </>
  );
}

function BlockRow({
  block,
  index,
  onUpdate,
  onRemove,
  isDragging,
  isDropTarget,
  onGripPointerDown,
  onDragEnter,
  onDragOver,
  onDrop,
  initData,
}: {
  block: RichPostBlock;
  index: number;
  onUpdate: (block: RichPostBlock) => void;
  onRemove: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onGripPointerDown: (e: React.PointerEvent) => void;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  initData?: string;
}) {
  return (
    <div
      data-block-index={index}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group flex gap-1 rounded-xl transition-colors ${
        isDropTarget ? 'bg-[#517da2]/8 ring-2 ring-[#517da2]/30' : ''
      } ${isDragging ? 'opacity-40 scale-[0.99]' : ''}`}
    >
      <button
        type="button"
        aria-label="Перетащить блок"
        onPointerDown={onGripPointerDown}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', String(index));
          e.dataTransfer.effectAllowed = 'move';
        }}
        className="shrink-0 w-8 flex items-start justify-center pt-3 text-slate-300 active:text-[#517da2] touch-none cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0 py-2 pr-[4.25rem] relative border-b border-slate-100 last:border-0">
        <div className="absolute right-0 top-2 flex items-center gap-0.5">
          {block.type !== 'divider' && (
            <button
              type="button"
              aria-label="Очистить поле"
              disabled={!blockHasContent(block)}
              onClick={() => onUpdate(clearBlockContent(block))}
              className="w-7 h-7 rounded-lg text-slate-300 hover:text-[#517da2] disabled:opacity-30 disabled:pointer-events-none opacity-70 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100"
              title="Очистить поле"
            >
              <Eraser className="w-3.5 h-3.5 mx-auto" />
            </button>
          )}
          <button
            type="button"
            aria-label="Удалить блок"
            onClick={onRemove}
            className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-500 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100"
            title="Удалить блок"
          >
            <Trash2 className="w-3.5 h-3.5 mx-auto" />
          </button>
        </div>

        {block.type === 'heading' && (
          <>
            <div className="flex flex-wrap gap-1 mb-1">
              {([1, 2, 3, 4, 5, 6] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onUpdate({ ...block, level: lvl })}
                  className={`min-w-[2rem] px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                    block.level === lvl
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  H{lvl}
                </button>
              ))}
            </div>
            <input
              value={block.text}
              onChange={(e) => onUpdate({ ...block, text: e.target.value })}
              placeholder={
                block.level === 1
                  ? 'Заголовок'
                  : block.level === 2
                    ? 'Подзаголовок'
                    : 'Заголовок'
              }
              className={`w-full border-0 bg-transparent outline-none text-slate-900 placeholder:text-slate-300 ${HEADING_INPUT_CLASS[block.level]}`}
            />
          </>
        )}

        {block.type === 'paragraph' && (
          <FormatBar
            value={block.text}
            onChange={(text) => onUpdate({ ...block, text })}
            initData={initData}
          />
        )}

        {block.type === 'list' && (
          <ListBlockEditor block={block} onUpdate={(b) => onUpdate(b)} />
        )}

        {block.type === 'quote' && (
          <div className="border-l-2 border-[#517da2]/50 pl-3">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <button
                type="button"
                onClick={() => onUpdate({ ...block, pull: !block.pull })}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                  block.pull ? 'bg-[#517da2] text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                Pull-quote
              </button>
              {block.pull && (
                <input
                  value={block.credit}
                  onChange={(e) => onUpdate({ ...block, credit: e.target.value })}
                  placeholder="Автор (необязательно)"
                  className="flex-1 min-w-[120px] border-0 border-b border-slate-100 bg-transparent py-0.5 text-[13px] text-slate-500 outline-none"
                />
              )}
            </div>
            <FormatBar
              value={block.text}
              onChange={(text) => onUpdate({ ...block, text })}
              initData={initData}
            />
          </div>
        )}

        {block.type === 'media' && (
          <MediaBlockEditor
            url={block.url}
            caption={block.caption}
            credit={block.credit}
            kind={block.kind}
            initData={initData}
            onChange={(patch) => onUpdate({ ...block, ...patch })}
          />
        )}

        {(block.type === 'collage' || block.type === 'slideshow') && (
          <MediaGroupEditor
            items={block.items}
            caption={block.caption}
            credit={block.credit}
            initData={initData}
            onChange={(patch) => onUpdate({ ...block, ...patch })}
          />
        )}

        {block.type === 'table' && (
          <div className="overflow-x-auto text-[13px]">
            <table className="w-full">
              <thead>
                <tr>
                  {block.headers.map((_, ci) => {
                    const align = getColumnAlign(block.aligns, ci);
                    const setAlign = (a: TableAlign) => {
                      const aligns = block.headers.map((__, i) => getColumnAlign(block.aligns, i));
                      aligns[ci] = a;
                      onUpdate({ ...block, aligns });
                    };
                    return (
                      <th key={ci} className="p-1">
                        <div className="flex justify-center gap-0.5 mb-1">
                          {(['left', 'center', 'right'] as const).map((a) => (
                            <button
                              key={a}
                              type="button"
                              onClick={() => setAlign(a)}
                              className={`w-6 h-5 rounded text-[10px] font-bold ${
                                align === a ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'
                              }`}
                              title={a === 'left' ? 'Влево' : a === 'center' ? 'По центру' : 'Вправо'}
                            >
                              {a === 'left' ? '⟸' : a === 'center' ? '≡' : '⟹'}
                            </button>
                          ))}
                        </div>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {block.headers.map((h, ci) => (
                    <th key={ci} className="p-1">
                      <input
                        value={h}
                        onChange={(e) => {
                          const headers = [...block.headers];
                          headers[ci] = e.target.value;
                          onUpdate({ ...block, headers });
                        }}
                        placeholder={`Col ${ci + 1}`}
                        className="w-full px-2 py-1 rounded border border-slate-200 font-bold"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>
                    {block.headers.map((_, ci) => (
                      <td key={ci} className="p-1">
                        <input
                          value={row[ci] ?? ''}
                          onChange={(e) => {
                            const rows = block.rows.map((r) => [...r]);
                            while (rows[ri].length < block.headers.length) rows[ri].push('');
                            rows[ri][ci] = e.target.value;
                            onUpdate({ ...block, rows });
                          }}
                          className="w-full px-2 py-1 rounded border border-slate-100"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    ...block,
                    headers: [...block.headers, ''],
                    aligns: [...block.headers.map((_, i) => getColumnAlign(block.aligns, i)), 'left'],
                    rows: block.rows.map((r) => [...r, '']),
                  })
                }
                className="text-[11px] text-slate-500"
              >
                + колонка
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdate({ ...block, rows: [...block.rows, block.headers.map(() => '')] })
                }
                className="text-[11px] text-slate-500"
              >
                + строка
              </button>
            </div>
          </div>
        )}

        {block.type === 'code' && (
          <>
            <input
              value={block.language}
              onChange={(e) => onUpdate({ ...block, language: e.target.value })}
              placeholder="Язык (python, js…)"
              className="w-full mb-1.5 border-0 border-b border-slate-100 bg-transparent py-1 text-[13px] text-slate-500 outline-none"
            />
            <AutoTextarea
              value={block.code}
              onChange={(code) => onUpdate({ ...block, code })}
              placeholder="Код"
              minRows={4}
              maxHeight={360}
              className="rounded-lg bg-[#1e1e1e] text-[#d4d4d4] px-3 py-2 text-[13px] font-mono"
            />
          </>
        )}

        {block.type === 'math' && (
          <AutoTextarea
            value={block.expression}
            onChange={(expression) => onUpdate({ ...block, expression })}
            placeholder="Формула (LaTeX)"
            minRows={2}
            className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-indigo-900 font-mono"
          />
        )}

        {block.type === 'details' && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                <input
                  type="checkbox"
                  checked={block.open}
                  onChange={(e) => onUpdate({ ...block, open: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Открыт по умолчанию
              </label>
            </div>
            <input
              value={block.summary}
              onChange={(e) => onUpdate({ ...block, summary: e.target.value })}
              placeholder="Заголовок раскрывашки"
              className="w-full font-semibold text-[16px] border-0 bg-transparent outline-none mb-1"
            />
            <AutoTextarea
              value={block.body}
              onChange={(body) => onUpdate({ ...block, body })}
              placeholder="Скрытый текст"
              minRows={2}
              className="text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5"
            />
            {detailsFieldsContainMath(block.summary, block.body) && (
              <p className="mt-1.5 text-[11px] font-semibold text-amber-800 leading-snug">
                {MATH_IN_DETAILS_ERROR}
              </p>
            )}
          </>
        )}

        {block.type === 'map' && (
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            {(['lat', 'lon', 'zoom'] as const).map((key) => (
              <input
                key={key}
                value={block[key]}
                onChange={(e) => onUpdate({ ...block, [key]: e.target.value })}
                placeholder={key}
                className="rounded-lg border border-slate-200 px-2 py-1.5"
              />
            ))}
            <input
              value={block.caption}
              onChange={(e) => onUpdate({ ...block, caption: e.target.value })}
              placeholder="Подпись"
              className="col-span-3 border-0 border-b border-slate-100 py-1 outline-none"
            />
          </div>
        )}

        {block.type === 'divider' && <hr className="border-slate-200 my-2" />}

        {block.type === 'footer' && (
          <input
            value={block.text}
            onChange={(e) => onUpdate({ ...block, text: e.target.value })}
            placeholder="Подпись внизу поста"
            className="w-full text-center text-[13px] text-slate-400 border-0 bg-transparent outline-none"
          />
        )}
      </div>
    </div>
  );
}

export function RichPostComposer({
  blocks,
  onChange,
  buttons,
  onButtonsChange,
  channel,
  onChannelChange,
  charLimit,
  markdown,
  telegramBlocks,
  telegramMarkdown,
  onTelegramDraft,
  onPublish,
  sending,
  disabled,
  initData,
}: RichPostComposerProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const keyboardOpen = useVirtualKeyboardOpen();
  const wideLayout = useWideLayout();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);

  useEffect(() => {
    dropIndexRef.current = dropIndex;
  }, [dropIndex]);

  const applyReorder = useCallback(
    (from: number, to: number) => {
      onChange(reorderBlocks(blocks, from, to));
    },
    [blocks, onChange],
  );

  const finishDrag = useCallback(
    (from: number | null, to: number | null) => {
      if (from !== null && to !== null) applyReorder(from, to);
      dragFromRef.current = null;
      setDragFrom(null);
      setDropIndex(null);
    },
    [applyReorder],
  );

  useEffect(() => {
    if (dragFrom === null) return;

    const onMove = (e: PointerEvent) => {
      const idx = blockIndexFromPoint(e.clientX, e.clientY);
      if (idx !== null) setDropIndex(idx);
    };

    const onUp = () => {
      const from = dragFromRef.current;
      const to = dropIndexRef.current ?? from;
      finishDrag(from, to);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragFrom, finishDrag]);

  const startPointerDrag = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    dragFromRef.current = index;
    setDragFrom(index);
    setDropIndex(index);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleHtml5Drop = (targetIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const from = Number(raw);
    if (Number.isFinite(from)) applyReorder(from, targetIndex);
    setDragFrom(null);
    setDropIndex(null);
  };

  const markdownLocal = useMemo(() => richBlocksToMarkdown(blocks), [blocks]);
  const charCount = useMemo(() => new TextEncoder().encode(markdownLocal).length, [markdownLocal]);
  const overLimit = charCount > charLimit;
  const mathInDetails = useMemo(() => markdownHasMathInsideDetails(markdown), [markdown]);

  const updateBlock = (index: number, block: RichPostBlock) => {
    const next = [...blocks];
    next[index] = block;
    onChange(next);
  };

  const removeBlock = (index: number) => onChange(blocks.filter((_, i) => i !== index));

  const addBlock = (kind: RichBlockKind) => {
    onChange([...blocks, createBlock(kind)]);
    setShowExtra(false);
  };

  const addKinds = showExtra ? [...ADD_BLOCK_KINDS, ...EXTRA_BLOCK_KINDS] : ADD_BLOCK_KINDS;

  const previewPanel = (
    <RichMessagePreview
      blocks={blocks}
      buttons={buttons}
      telegramBlocks={telegramBlocks}
      telegramMarkdown={telegramMarkdown}
      markdown={markdown}
    />
  );

  return (
    <>
      <div className="editor-wide-grid">
        <div className="space-y-4 pb-4 min-w-0">
        <input
          value={channel}
          onChange={(e) => onChannelChange(e.target.value)}
          placeholder="Канал @channel (для публикации)"
          className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-[16px] font-medium outline-none focus:border-[#517da2]/50 placeholder:text-slate-400"
        />

        <div className="flex items-center justify-between">
          <span className={`text-[11px] font-bold tabular-nums ${overLimit ? 'text-red-600' : 'text-slate-400'}`}>
            {charCount.toLocaleString('ru-RU')} / {charLimit.toLocaleString('ru-RU')}
          </span>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[12px] font-bold text-slate-700 active:scale-95 shadow-sm"
          >
            <Eye className="w-4 h-4 text-[#517da2]" />
            Превью TG
          </button>
        </div>

        <div className="min-h-[120px]">
          {dragFrom !== null && (
            <p className="text-[10px] text-center text-[#517da2] font-semibold py-1">
              Отпустите, чтобы вставить блок на место подсветки
            </p>
          )}
          {blocks.map((block, index) => (
            <BlockRow
              key={block.id}
              block={block}
              index={index}
              onUpdate={(b) => updateBlock(index, b)}
              onRemove={() => removeBlock(index)}
              isDragging={dragFrom === index}
              isDropTarget={dropIndex === index && dragFrom !== null && dragFrom !== index}
              onGripPointerDown={(e) => startPointerDrag(index, e)}
              onDragEnter={() => setDropIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleHtml5Drop(index, e)}
              initData={initData}
            />
          ))}

          <div className="py-3 border-t border-dashed border-slate-100 mt-1">
            <div className="flex flex-wrap gap-1.5">
              {addKinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => addBlock(kind)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-[12px] font-semibold text-slate-600 active:scale-95"
                >
                  <Plus className="w-3 h-3 text-[#517da2]" />
                  {BLOCK_LABELS[kind]}
                </button>
              ))}
              {!showExtra && (
                <button
                  type="button"
                  onClick={() => setShowExtra(true)}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-400"
                >
                  ещё…
                </button>
              )}
            </div>
          </div>
        </div>

        <ButtonsEditor rows={buttons} onChange={onButtonsChange} initData={initData} />
        </div>

        {wideLayout && (
          <aside className="hidden lg:block sticky top-3 self-start min-w-0">
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-slate-600">Превью Telegram</p>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="text-[11px] font-semibold text-[#517da2] hover:underline shrink-0"
                >
                  На весь экран
                </button>
              </div>
              <div className="p-2 max-h-[calc(100dvh-120px)] overflow-y-auto">
                {previewPanel}
              </div>
              <p className="text-[10px] text-slate-400 text-center px-3 pb-2 leading-snug">
                {telegramBlocks?.length && telegramMarkdown === markdown
                  ? 'Точное превью после «Себе»'
                  : 'Черновик · «Себе» для точного совпадения'}
              </p>
            </div>
          </aside>
        )}
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm"
          style={{
            paddingTop: 'var(--superapp-safe-top, 0px)',
            paddingBottom: 'var(--superapp-safe-bottom, 0px)',
          }}
        >
          <div className="flex-1 overflow-y-auto px-4 py-3 app-shell-modal mx-auto w-full">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-black text-white">Как будет в Telegram</h2>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="w-9 h-9 rounded-xl bg-white/15 text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {previewPanel}
            <p className="text-[11px] text-white/70 text-center mt-3 px-4">
              {telegramBlocks?.length && telegramMarkdown === markdown
                ? 'Точное превью из Telegram — как в сообщении «Себе».'
                : 'Черновик. Нажмите «Себе», затем снова откройте превью для точного совпадения.'}
            </p>
          </div>
        </div>
      )}

      <div
        className={`fixed left-0 right-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/95 backdrop-blur-md transition-transform duration-200 ease-out ${
          keyboardOpen ? 'translate-y-full pointer-events-none opacity-0' : 'translate-y-0 opacity-100'
        }`}
        style={{
          paddingBottom: 'calc(var(--superapp-safe-bottom, 0px) + 8px)',
          paddingLeft: 'var(--superapp-safe-left, 0px)',
          paddingRight: 'var(--superapp-safe-right, 0px)',
        }}
      >
        <div className="app-shell pt-2 !px-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="w-9 h-9 shrink-0 rounded-xl border border-slate-200 bg-white text-[#517da2] flex items-center justify-center active:scale-95"
            aria-label="Превью"
            title="Превью"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={disabled || !!sending || overLimit || mathInDetails || !blocks.length}
            onClick={onTelegramDraft}
            className="flex-1 h-9 rounded-xl bg-[#517da2] text-white font-bold text-[11px] active:scale-[0.98] disabled:opacity-50 inline-flex items-center justify-center gap-1 min-w-0 px-2"
            title="Отправить себе в личку с ботом"
          >
            {sending === 'draft' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <>
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Себе</span>
              </>
            )}
          </button>
          <button
            type="button"
            disabled={disabled || !!sending || overLimit || mathInDetails || !channel.trim() || !blocks.length}
            onClick={onPublish}
            className="flex-1 h-9 rounded-xl bg-orange-500 text-white font-bold text-[11px] inline-flex items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-50 min-w-0 px-2"
            title="Опубликовать в канал"
          >
            {sending === 'publish' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <>
                <Megaphone className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">В канал</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default RichPostComposer;
