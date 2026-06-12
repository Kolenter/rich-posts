import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Loader2, Send, Sparkles } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useTelegram } from '../hooks/useTelegram';
import { useVirtualKeyboardOpen } from '../hooks/useVirtualKeyboardOpen';
import { RichPostComposer } from '../components/RichPostComposer';
import { HistoryModal } from '../components/HistoryModal';
import {
  blocksForEditorMode,
  buildReplyMarkup,
  DEMO_BUTTONS,
  loadRichDrafts,
  loadStarterButtons,
  newBlockId,
  RICH_CHANNEL_STORAGE_KEY,
  saveRichDrafts,
  saveStarterButtons,
  switchEditorMode,
  type ButtonRow,
  type EditorMode,
  type RichDraftsStore,
  type RichPostBlock,
} from '../data/richPostModel';
import type { TelegramRichBlock } from '../data/telegramRichTypes';
import { richBlocksToMarkdown } from '../utils/richBlocksToMarkdown';
import {
  MATH_IN_DETAILS_ERROR,
  markdownHasMathInsideDetails,
} from '../utils/tdesktopMathDetailsGuard';
import { apiPath } from '../lib/api';

type RichMeta = {
  text_limit: number;
  default_channel: string;
  bot_username: string;
};

/** Свежие id для шаблонных кнопок, чтобы избежать дублей React-key. */
function cloneButtons(rows: ButtonRow[]): ButtonRow[] {
  return rows.map((row) => ({
    id: newBlockId(),
    buttons: row.buttons.map((b) => ({ ...b, id: newBlockId() })),
  }));
}

export const RichPostsPage: React.FC = () => {
  const { WebApp: tg, hapticFeedback, isMobile } = useTelegram();
  const keyboardOpen = useVirtualKeyboardOpen();

  const initialDrafts = loadRichDrafts();
  const draftsRef = useRef<RichDraftsStore>(initialDrafts);
  const [editorMode, setEditorMode] = useState<EditorMode>(initialDrafts.mode);
  const [blocks, setBlocks] = useState<RichPostBlock[]>(() =>
    blocksForEditorMode(initialDrafts, initialDrafts.mode),
  );
  const [buttons, setButtons] = useState<ButtonRow[]>(() =>
    initialDrafts.mode === 'demo' ? cloneButtons(DEMO_BUTTONS) : loadStarterButtons(),
  );
  const [channel, setChannel] = useState('');
  const [meta, setMeta] = useState<RichMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [sending, setSending] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftHint, setDraftHint] = useState<string | null>(null);
  const [telegramBlocks, setTelegramBlocks] = useState<TelegramRichBlock[] | null>(null);
  const [telegramMarkdown, setTelegramMarkdown] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const markdown = useMemo(() => richBlocksToMarkdown(blocks), [blocks]);
  const charLimit = meta?.text_limit ?? 32768;
  const charCount = useMemo(() => new TextEncoder().encode(markdown).length, [markdown]);
  const overLimit = charCount > charLimit;
  const mathInDetails = useMemo(() => markdownHasMathInsideDetails(markdown), [markdown]);
  const canSendSelf = blocks.length > 0 && !overLimit && !mathInDetails && sending !== 'draft';

  const pageStyle: React.CSSProperties = isMobile
    ? {
        minHeight: 'var(--tg-viewport-height, 100dvh)',
        paddingTop: 'calc(var(--superapp-safe-top, 52px) + 4px)',
        paddingBottom: keyboardOpen
          ? 'calc(var(--superapp-safe-bottom, 0px) + 16px)'
          : 'calc(var(--superapp-safe-bottom, 0px) + 88px)',
      }
    : {
        minHeight: 'var(--tg-viewport-height, 100dvh)',
        paddingBottom: keyboardOpen ? 24 : 96,
      };

  const haptic = (style: 'light' | 'medium' = 'light') => {
    try {
      hapticFeedback.impactOccurred(style);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    draftsRef.current = {
      mode: editorMode,
      starter: editorMode === 'starter' ? blocks : draftsRef.current.starter,
    };
    saveRichDrafts(draftsRef.current);
  }, [blocks, editorMode]);

  useEffect(() => {
    if (editorMode === 'starter') saveStarterButtons(buttons);
  }, [buttons, editorMode]);

  useEffect(() => {
    const savedChannel = localStorage.getItem(RICH_CHANNEL_STORAGE_KEY);
    if (savedChannel) setChannel(savedChannel);

    const initData = WebApp.initData;
    if (!initData) {
      setLoadingMeta(false);
      return;
    }

    fetch(apiPath('/api/v1/rich-posts/meta'), {
      headers: { 'X-Telegram-Init-Data': initData },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<RichMeta>;
      })
      .then((data) => {
        setMeta(data);
        if (!savedChannel && data.default_channel) setChannel(data.default_channel);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoadingMeta(false));
  }, []);

  const persistChannel = (value: string) => {
    setChannel(value);
    localStorage.setItem(RICH_CHANNEL_STORAGE_KEY, value);
  };

  const apiPost = useCallback(async (path: string, body: object) => {
    const initData = WebApp.initData;
    if (!initData) throw new Error('Нет initData Telegram');
    const res = await fetch(apiPath(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    return data;
  }, []);

  const sendDraft = async () => {
    if (mathInDetails) {
      setError(MATH_IN_DETAILS_ERROR);
      return;
    }
    haptic('medium');
    setSending('draft');
    setError(null);
    setDraftHint(null);
    try {
      const replyMarkup = buildReplyMarkup(buttons);
      const data = await apiPost('/api/v1/rich-posts/draft', {
        markdown,
        draft_id: 1,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      if (Array.isArray(data.blocks) && data.blocks.length) {
        setTelegramBlocks(data.blocks as TelegramRichBlock[]);
        setTelegramMarkdown(markdown);
      }
      const bot = meta?.bot_username || 'RichMessages_bot';
      setDraftHint(`Отправлено вам в личку @${bot} (#${data.message_id}) — сверните mini app и посмотрите чат`);
      tg?.showAlert?.(
        `Бот @${bot} прислал вам пост в личку (сообщение #${data.message_id}). Сверните приложение — так будет выглядеть в Telegram.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setSending(null);
    }
  };

  const publish = async () => {
    if (!channel.trim()) {
      setError('Укажите канал');
      return;
    }
    if (mathInDetails) {
      setError(MATH_IN_DETAILS_ERROR);
      return;
    }
    haptic('medium');
    setSending('publish');
    setError(null);
    try {
      const replyMarkup = buildReplyMarkup(buttons);
      const data = await apiPost('/api/v1/rich-posts/send', {
        markdown,
        mode: 'publish',
        chat_id: channel.trim(),
        blocks,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      tg?.showAlert?.(`Опубликовано в ${channel}. msg #${data.message_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка публикации');
    } finally {
      setSending(null);
    }
  };

  const restoreFromHistory = (restoredBlocks: RichPostBlock[], hadMedia: boolean) => {
    haptic();
    const withIds = restoredBlocks.map((b, i) => ({
      ...b,
      id: b.id || `restored-${Date.now()}-${i}`,
    }));
    const next: RichDraftsStore = { mode: 'starter', starter: withIds };
    draftsRef.current = next;
    saveRichDrafts(next);
    setEditorMode('starter');
    setBlocks(withIds);
    setTelegramBlocks(null);
    setTelegramMarkdown(null);
    setHistoryOpen(false);
    if (hadMedia) {
      tg?.showAlert?.('Пост восстановлен. Медиафайлы не сохраняются — прикрепите их заново.');
    }
  };

  const handleSwitchMode = (nextMode: EditorMode) => {
    if (nextMode === editorMode) return;
    haptic();
    const { store, blocks: nextBlocks } = switchEditorMode(
      draftsRef.current,
      editorMode,
      blocks,
      nextMode,
    );
    draftsRef.current = store;
    saveRichDrafts(store);
    if (editorMode === 'starter') saveStarterButtons(buttons);
    setEditorMode(nextMode);
    setBlocks(nextBlocks);
    setButtons(nextMode === 'demo' ? cloneButtons(DEMO_BUTTONS) : loadStarterButtons());
  };

  return (
    <div className="min-h-screen bg-[#f5f4fa]" style={pageStyle}>
      <div className="app-shell">
        <header className="flex items-start gap-3 mb-4 pt-1">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Rich Posts</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">Редактор Rich Messages</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                haptic();
                setHistoryOpen(true);
              }}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-white border-slate-200 text-slate-600 inline-flex items-center gap-1"
              title="История публикаций"
            >
              <Clock className="w-3 h-3" />
              История
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('starter')}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                editorMode === 'starter'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              Старт
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('demo')}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                editorMode === 'demo'
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-orange-50 border-orange-200 text-orange-700'
              }`}
            >
              Пример
            </button>
          </div>
        </header>

        {editorMode === 'demo' && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-200/80 px-3 py-2">
            <p className="flex-1 min-w-0 text-[11px] text-orange-900/90 font-semibold leading-snug">
              Демо-статья — отправьте себе, чтобы увидеть в Telegram
            </p>
            <button
              type="button"
              disabled={!canSendSelf}
              onClick={sendDraft}
              className="shrink-0 h-8 px-2.5 rounded-lg bg-[#517da2] text-white text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 disabled:opacity-50"
            >
              {sending === 'draft' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Себе
                </>
              )}
            </button>
          </div>
        )}

        {loadingMeta && (
          <p className="text-center text-[12px] text-slate-400 mb-3 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка…
          </p>
        )}

        {draftHint && (
          <div className="mb-3 rounded-xl bg-[#517da2]/10 border border-[#517da2]/20 px-3 py-2.5 text-[12px] font-semibold text-[#3d6280] flex gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
            {draftHint}
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] font-semibold text-red-700">
            {error}
          </div>
        )}

        {mathInDetails && !error && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] font-semibold text-amber-900">
            {MATH_IN_DETAILS_ERROR}
          </div>
        )}

        <RichPostComposer
          blocks={blocks}
          onChange={setBlocks}
          buttons={buttons}
          onButtonsChange={setButtons}
          channel={channel}
          onChannelChange={persistChannel}
          botUsername={meta?.bot_username}
          charLimit={charLimit}
          markdown={markdown}
          telegramBlocks={telegramBlocks}
          telegramMarkdown={telegramMarkdown}
          onTelegramDraft={sendDraft}
          onPublish={publish}
          sending={sending}
          initData={WebApp.initData}
        />
      </div>

      {historyOpen && (
        <HistoryModal
          initData={WebApp.initData}
          onClose={() => setHistoryOpen(false)}
          onRestore={restoreFromHistory}
        />
      )}
    </div>
  );
};

export default RichPostsPage;
