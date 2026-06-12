import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 180;

const MIME_CANDIDATES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
];

export function isVoiceRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

function pickMimeType(): string {
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function extForMime(mime: string): string {
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mp4') || mime.includes('aac')) return '.m4a';
  return '.ogg';
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export type VoiceRecorderState = 'idle' | 'recording' | 'processing';

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef('');
  const stopRef = useRef<() => Promise<File | null>>(async () => null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      if (recorderRef.current?.state === 'recording') {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      cleanupStream();
    };
  }, [clearTimer, cleanupStream]);

  const cancel = useCallback(() => {
    clearTimer();
    setSeconds(0);
    setError(null);
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    cleanupStream();
    setState('idle');
  }, [clearTimer, cleanupStream]);

  const start = useCallback(async () => {
    setError(null);
    if (!isVoiceRecordingSupported()) {
      setError('Запись не поддерживается в этом браузере');
      return;
    }

    const mimeType = pickMimeType();
    if (!mimeType) {
      setError('Формат записи не поддерживается');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = mimeType;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(250);
      setSeconds(0);
      setState('recording');

      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_SECONDS) {
            setTimeout(() => void stopRef.current(), 0);
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      cleanupStream();
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        setError('Разрешите доступ к микрофону в настройках Telegram/телефона');
      } else {
        setError('Не удалось начать запись');
      }
      setState('idle');
    }
  }, [cleanupStream]);

  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      clearTimer();
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setState('idle');
        resolve(null);
        return;
      }

      setState('processing');

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || mimeRef.current || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        recorderRef.current = null;
        cleanupStream();

        if (blob.size < 100) {
          setError('Слишком короткая запись');
          setState('idle');
          setSeconds(0);
          resolve(null);
          return;
        }

        const ext = extForMime(mimeType);
        const file = new File([blob], `voice-${Date.now()}${ext}`, { type: mimeType });
        setState('idle');
        setSeconds(0);
        resolve(file);
      };

      try {
        recorder.stop();
      } catch {
        setState('idle');
        setError('Ошибка остановки записи');
        resolve(null);
      }
    });
  }, [clearTimer, cleanupStream]);

  stopRef.current = stop;

  return {
    state,
    seconds,
    formattedDuration: formatDuration(seconds),
    error,
    maxSeconds: MAX_SECONDS,
    start,
    stop,
    cancel,
    supported: isVoiceRecordingSupported(),
  };
}
