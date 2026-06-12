import { useEffect, useState } from 'react';

const WIDE_QUERY = '(min-width: 1024px)';

/** Широкий экран (Telegram Desktop / растянутое окно). */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return wide;
}

export default useWideLayout;
