import { useState } from 'react';
import { Plus, Smile, Trash2 } from 'lucide-react';
import {
  BUTTON_ROWS_LIMIT,
  BUTTON_STYLE_LABELS,
  BUTTONS_PER_ROW_LIMIT,
  createButton,
  createButtonRow,
  type ButtonRow,
  type ButtonStyle,
  type PostButton,
} from '../data/richPostModel';
import { EmojiPicker } from './EmojiPicker';

type ButtonsEditorProps = {
  rows: ButtonRow[];
  onChange: (rows: ButtonRow[]) => void;
  initData?: string;
};

const STYLE_ORDER: (ButtonStyle | undefined)[] = [undefined, 'primary', 'success', 'danger'];

const STYLE_SWATCH: Record<string, string> = {
  default: 'bg-slate-200 text-slate-600',
  primary: 'bg-[#3390ec] text-white',
  success: 'bg-[#4dad51] text-white',
  danger: 'bg-[#e0533d] text-white',
};

export function ButtonsEditor({ rows, onChange, initData }: ButtonsEditorProps) {
  const [emojiFor, setEmojiFor] = useState<string | null>(null);

  const updateButton = (rowId: string, btnId: string, patch: Partial<PostButton>) => {
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, buttons: row.buttons.map((b) => (b.id === btnId ? { ...b, ...patch } : b)) }
          : row,
      ),
    );
  };

  const removeButton = (rowId: string, btnId: string) => {
    onChange(
      rows
        .map((row) =>
          row.id === rowId ? { ...row, buttons: row.buttons.filter((b) => b.id !== btnId) } : row,
        )
        .filter((row) => row.buttons.length > 0),
    );
  };

  const addButtonToRow = (rowId: string) => {
    onChange(
      rows.map((row) =>
        row.id === rowId && row.buttons.length < BUTTONS_PER_ROW_LIMIT
          ? { ...row, buttons: [...row.buttons, createButton()] }
          : row,
      ),
    );
  };

  const addRow = () => {
    if (rows.length >= BUTTON_ROWS_LIMIT) return;
    onChange([...rows, createButtonRow()]);
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-slate-700">Кнопки под постом</p>
        <span className="text-[10px] text-slate-400">inline-клавиатура</span>
      </div>

      {rows.length === 0 && (
        <p className="text-[11px] text-slate-400 leading-snug">
          Кнопки-ссылки под сообщением. Цвет работает у всех, иконка-эмодзи — только если у бота
          Premium/Fragment.
        </p>
      )}

      {rows.map((row, ri) => (
        <div key={row.id} className="rounded-lg bg-slate-50 border border-slate-100 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400">Ряд {ri + 1}</span>
            {row.buttons.length < BUTTONS_PER_ROW_LIMIT && (
              <button
                type="button"
                onClick={() => addButtonToRow(row.id)}
                className="text-[10px] font-semibold text-[#517da2]"
              >
                + кнопка в ряд
              </button>
            )}
          </div>

          {row.buttons.map((btn) => (
            <div key={btn.id} className="rounded-md bg-white border border-slate-200 p-2 space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  value={btn.text}
                  onChange={(e) => updateButton(row.id, btn.id, { text: e.target.value })}
                  placeholder="Текст кнопки"
                  className="flex-1 min-w-0 rounded border border-slate-200 px-2 py-1 text-[12px] font-semibold outline-none focus:border-[#517da2]/50"
                />
                <button
                  type="button"
                  onClick={() => removeButton(row.id, btn.id)}
                  className="shrink-0 p-1 text-slate-300 hover:text-red-500"
                  aria-label="Удалить кнопку"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={btn.url}
                onChange={(e) => updateButton(row.id, btn.id, { url: e.target.value })}
                placeholder="https:// или tg://"
                inputMode="url"
                className="w-full rounded border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-[#517da2]/50"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Цвет:</span>
                {STYLE_ORDER.map((s) => {
                  const key = s ?? 'default';
                  const active = (btn.style ?? undefined) === s;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateButton(row.id, btn.id, { style: s })}
                      className={`h-6 px-2 rounded-md text-[10px] font-bold ${STYLE_SWATCH[key]} ${
                        active ? 'ring-2 ring-offset-1 ring-slate-900' : 'opacity-70'
                      }`}
                      title={s ? BUTTON_STYLE_LABELS[s] : 'По умолчанию'}
                    >
                      {s ? BUTTON_STYLE_LABELS[s] : 'Авто'}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  value={btn.emojiId ?? ''}
                  onChange={(e) =>
                    updateButton(row.id, btn.id, { emojiId: e.target.value.replace(/[^\d]/g, '') })
                  }
                  placeholder="иконка-эмодзи (Premium)"
                  inputMode="numeric"
                  className="flex-1 min-w-0 rounded border border-slate-100 px-2 py-1 text-[11px] text-slate-400 outline-none focus:border-[#517da2]/50"
                />
                <button
                  type="button"
                  onClick={() => setEmojiFor(emojiFor === btn.id ? null : btn.id)}
                  className={`shrink-0 h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${
                    emojiFor === btn.id ? 'bg-[#517da2] text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Smile className="w-3.5 h-3.5" />
                  Выбрать
                </button>
                {btn.emojiId?.trim() && (
                  <button
                    type="button"
                    onClick={() => updateButton(row.id, btn.id, { emojiId: '' })}
                    className="shrink-0 p-1 text-slate-300 hover:text-red-500"
                    aria-label="Убрать иконку"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {emojiFor === btn.id && (
                <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
                  <EmojiPicker
                    initData={initData}
                    onPick={(s) => {
                      updateButton(row.id, btn.id, { emojiId: s.id });
                      setEmojiFor(null);
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {rows.length < BUTTON_ROWS_LIMIT && (
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-[12px] font-semibold text-slate-600 active:scale-95"
        >
          <Plus className="w-3 h-3 text-[#517da2]" />
          {rows.length ? 'Ряд кнопок' : 'Добавить кнопки'}
        </button>
      )}
    </div>
  );
}

export default ButtonsEditor;
