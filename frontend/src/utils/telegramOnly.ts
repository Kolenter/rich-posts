import WebApp from '@twa-dev/sdk';

const BOT_USERNAME = 'RichMessages_bot';
const BOT_DEEP_LINK = `https://t.me/${BOT_USERNAME}`;

/** true только внутри Telegram Mini App с подписанным initData */
export function isTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false;

  const initData = (WebApp.initData || window.Telegram?.WebApp?.initData || '').trim();
  if (!initData) return false;

  const authDate = WebApp.initDataUnsafe?.auth_date ?? window.Telegram?.WebApp?.initDataUnsafe?.auth_date;
  if (!authDate) return false;

  const userId = WebApp.initDataUnsafe?.user?.id ?? window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!userId) return false;

  return true;
}

export function getBotDeepLink(): string {
  return BOT_DEEP_LINK;
}

export function getBotUsername(): string {
  return BOT_USERNAME;
}

/** Dev-only: VITE_ALLOW_BROWSER=1 отключает блокировку браузера */
export function isBrowserAccessAllowed(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ALLOW_BROWSER === '1';
}

export function canAccessApp(): boolean {
  return isBrowserAccessAllowed() || isTelegramMiniApp();
}
