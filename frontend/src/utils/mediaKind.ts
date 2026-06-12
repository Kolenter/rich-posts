export type MediaKind = 'photo' | 'video' | 'audio' | 'voice' | 'animation';

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  photo: 'Фото',
  video: 'Видео',
  audio: 'Аудио',
  voice: 'Голосовое',
  animation: 'GIF',
};

export const MEDIA_ACCEPT: Record<MediaKind, string> = {
  photo: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
  video: 'video/mp4,video/quicktime,video/*',
  audio: 'audio/mpeg,audio/mp3,audio/mp4,audio/wav,audio/*',
  voice: 'audio/ogg,audio/opus,audio/webm,.ogg,.oga,.opus,.webm',
  animation: 'image/gif',
};

export const MEDIA_ACCEPT_ALL =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/quicktime,audio/mpeg,audio/mp3,audio/ogg,audio/opus,audio/wav';

export function detectMediaKindFromFile(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (name.endsWith('.gif') || file.type === 'image/gif') return 'animation';
  if (file.type.startsWith('video/') || /\.(mp4|mov|m4v)$/.test(name)) return 'video';
  if (/\.(ogg|oga|opus|webm)$/.test(name) || file.type.includes('ogg') || file.type.includes('opus')) {
    return 'voice';
  }
  if (file.type === 'audio/webm' || (file.type.startsWith('audio/') && name.includes('voice-'))) {
    return 'voice';
  }
  if (file.type.startsWith('audio/') || /\.(mp3|m4a|wav)$/.test(name)) return 'audio';
  return 'photo';
}
