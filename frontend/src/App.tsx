import React from 'react';
import { TelegramOnlyGate } from './components/TelegramOnlyGate';
import { RichPostsPage } from './pages/RichPostsPage';
import { useTelegram } from './hooks/useTelegram';

export default function App() {
  useTelegram();
  return (
    <TelegramOnlyGate>
      <RichPostsPage />
    </TelegramOnlyGate>
  );
}
