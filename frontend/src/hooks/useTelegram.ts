import { useEffect, useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import { applyTelegramSafeArea, initTelegramChrome, isMobileTelegram } from '../utils/telegramChrome';

declare global {
  interface Window {
    Telegram?: {
      WebApp: typeof WebApp;
    };
  }
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export const useTelegram = () => {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isReady, setIsReady] = useState(() =>
    typeof window === 'undefined' || !!window.Telegram?.WebApp,
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : isMobileTelegram(),
  );

  useEffect(() => {
    try {
      initTelegramChrome();
      setIsMobile(isMobileTelegram());

      const u = WebApp.initDataUnsafe?.user;
      if (u?.id) {
        setUser({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          username: u.username,
          language_code: u.language_code,
          is_premium: u.is_premium,
        });
      }
      setIsReady(true);
    } catch {
      setIsReady(true);
    }

    const onResize = () => applyTelegramSafeArea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const hapticFeedback = {
    impactOccurred: useCallback((style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
      try {
        WebApp.HapticFeedback?.impactOccurred(style);
      } catch {
        /* ignore */
      }
    }, []),
  };

  return { user, WebApp, isReady, isMobile, hapticFeedback };
};
