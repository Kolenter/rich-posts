import React, { useMemo } from 'react';
import { TelegramOnlyGate } from './components/TelegramOnlyGate';
import { RichPostsPage } from './pages/RichPostsPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { useTelegram } from './hooks/useTelegram';

function isAdminView(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') return true;
  try {
    const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    return sp === 'admin';
  } catch {
    return false;
  }
}

export default function App() {
  useTelegram();
  const adminView = useMemo(() => isAdminView(), []);

  return (
    <TelegramOnlyGate>
      {adminView ? (
        <AdminDashboardPage onBack={() => window.location.replace(window.location.pathname)} />
      ) : (
        <RichPostsPage />
      )}
    </TelegramOnlyGate>
  );
}
