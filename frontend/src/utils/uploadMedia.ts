import { apiPath } from '../lib/api';
import type { MediaKind } from './mediaKind';

export type UploadResult = {
  ok: boolean;
  url: string;
  kind: MediaKind;
  filename: string;
  size: number;
};

export async function uploadMediaFile(file: File, initData: string): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(apiPath('/api/v1/rich-posts/upload'), {
    method: 'POST',
    headers: { 'X-Telegram-Init-Data': initData },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Ошибка загрузки файла');
  }
  return data as UploadResult;
}
