import WebApp from '@twa-dev/sdk';

const MOBILE_PLATFORMS = new Set(['ios', 'android', 'android_x']);
const APP_BG = '#f5f4fa';

function num(v: unknown): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

export function isMobileTelegram(): boolean {
  return MOBILE_PLATFORMS.has((WebApp.platform || '').toLowerCase());
}

/** Системные inset под шапку Telegram (close) и home indicator */
export function applyTelegramSafeArea(): void {
  const root = document.documentElement;

  if (!isMobileTelegram()) {
    root.style.setProperty('--superapp-safe-top', '0px');
    root.style.setProperty('--superapp-safe-bottom', '0px');
    root.style.setProperty('--superapp-safe-left', '0px');
    root.style.setProperty('--superapp-safe-right', '0px');
    root.style.setProperty('--tg-viewport-height', `${WebApp.viewportHeight || window.innerHeight}px`);
    return;
  }

  const sa = WebApp.safeAreaInset || {};
  const csa = WebApp.contentSafeAreaInset || {};
  let top = num(sa.top) + num(csa.top);
  const bottom = num(sa.bottom) + num(csa.bottom);
  const left = num(csa.left) || num(sa.left);
  const right = num(csa.right) || num(sa.right);

  // В fullscreen Telegram иногда отдаёт 0 до события — минимальный отступ под системную шапку
  if (WebApp.isFullscreen && top < 48) {
    top = Math.max(top, 52);
  } else if (top > 0 && top < 48) {
    top = Math.max(top, 48);
  }

  root.style.setProperty('--superapp-safe-top', `${top}px`);
  root.style.setProperty('--superapp-safe-bottom', `${bottom}px`);
  root.style.setProperty('--superapp-safe-left', `${left}px`);
  root.style.setProperty('--superapp-safe-right', `${right}px`);
  root.style.setProperty('--tg-viewport-height', `${WebApp.viewportHeight || window.innerHeight}px`);
}

/** Fullscreen + системный chrome Telegram (только mobile) */
export function initTelegramChrome(): void {
  if (!window.Telegram?.WebApp) return;

  try {
    WebApp.ready();
    WebApp.expand();

    // Одна страница — закрытие через системный крестик в fullscreen, не SDK BackButton
    WebApp.BackButton?.hide();

    if (WebApp.setHeaderColor) WebApp.setHeaderColor('bg_color');
    if (WebApp.setBackgroundColor) WebApp.setBackgroundColor(APP_BG);

    applyTelegramSafeArea();

    const onResize = () => applyTelegramSafeArea();
    window.addEventListener('resize', onResize);

    WebApp.onEvent('safeAreaChanged', applyTelegramSafeArea);
    WebApp.onEvent('contentSafeAreaChanged', applyTelegramSafeArea);
    WebApp.onEvent('viewportChanged', applyTelegramSafeArea);
    WebApp.onEvent('fullscreenChanged', applyTelegramSafeArea);

    if (isMobileTelegram()) {
      if (typeof WebApp.disableVerticalSwipes === 'function') {
        WebApp.disableVerticalSwipes();
      }
      if (WebApp.isVersionAtLeast?.('8.0') && typeof WebApp.requestFullscreen === 'function') {
        WebApp.requestFullscreen();
      }
    }
  } catch {
    /* ignore */
  }
}

export const closeMiniApp = (): void => {
  window.Telegram?.WebApp?.close();
};
