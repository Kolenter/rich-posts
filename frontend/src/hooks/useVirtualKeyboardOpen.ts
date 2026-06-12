import { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

function isTextField(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return el.matches('input, textarea, select, [contenteditable="true"]');
}

function detectKeyboardByViewport(): boolean {
  if (typeof window === 'undefined') return false;

  if (window.visualViewport) {
    const gap = window.innerHeight - window.visualViewport.height;
    if (gap > 100) return true;
  }

  const tg = WebApp;
  if (tg.viewportStableHeight && tg.viewportHeight) {
    return tg.viewportHeight < tg.viewportStableHeight - 72;
  }

  return false;
}

/** Клавиатура открыта (mobile Telegram / visualViewport). */
export function useVirtualKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const focused = isTextField(document.activeElement);
      setOpen(focused || detectKeyboardByViewport());
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target)) {
        window.setTimeout(sync, 50);
        window.setTimeout(sync, 300);
      }
    };

    const onFocusOut = () => {
      window.setTimeout(() => {
        if (!isTextField(document.activeElement)) {
          setOpen(detectKeyboardByViewport());
        }
      }, 80);
    };

    const onViewport = () => sync();

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.visualViewport?.addEventListener('resize', onViewport);
    WebApp.onEvent('viewportChanged', onViewport);

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.visualViewport?.removeEventListener('resize', onViewport);
      if (typeof WebApp.offEvent === 'function') {
        WebApp.offEvent('viewportChanged', onViewport);
      }
    };
  }, []);

  return open;
}

export default useVirtualKeyboardOpen;
