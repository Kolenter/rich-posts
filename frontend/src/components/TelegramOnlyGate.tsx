import React from 'react';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { canAccessApp, getBotDeepLink, getBotUsername } from '../utils/telegramOnly';

export const TelegramOnlyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!canAccessApp()) {
    return <BrowserBlockedScreen />;
  }
  return <>{children}</>;
};

const BrowserBlockedScreen: React.FC = () => (
  <div className="min-h-screen bg-[#f5f4fa] flex flex-col items-center justify-center px-6 text-center">
    <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-5 shadow-lg">
      <ShieldAlert className="w-8 h-8" strokeWidth={2} />
    </div>
    <h1 className="text-xl font-black text-slate-900 tracking-tight">Только через Telegram</h1>
    <p className="text-[14px] text-slate-500 mt-2 max-w-xs leading-relaxed">
      Rich Posts доступен только как Mini App внутри Telegram. Открытие в обычном браузере запрещено.
    </p>
    <a
      href={getBotDeepLink()}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#517da2] text-white font-bold text-[14px] active:scale-95"
    >
      <ExternalLink className="w-4 h-4" />
      Открыть @{getBotUsername()}
    </a>
  </div>
);

export default TelegramOnlyGate;
