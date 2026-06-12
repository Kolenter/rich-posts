import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Users } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { apiPath } from '../lib/api';

type DashboardTotals = {
  starts: number;
  app_opens: number;
  uploads: number;
  previews: number;
  publishes: number;
};

type RecentUser = {
  tg_id: number;
  username?: string;
  first_name?: string;
  first_seen: number;
  last_seen: number;
  starts: number;
  app_opens: number;
  uploads: number;
  previews: number;
  publishes: number;
};

export type AdminDashboard = {
  generated_at: number;
  users_total: number;
  users_new_today: number;
  users_new_week: number;
  users_active_today: number;
  users_active_week: number;
  totals: DashboardTotals;
  recent_users: RecentUser[];
};

function fmtTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userLabel(u: RecentUser): string {
  if (u.username) return `@${u.username}`;
  if (u.first_name) return u.first_name;
  return String(u.tg_id);
}

type Props = {
  onBack: () => void;
};

export function AdminDashboardPage({ onBack }: Props) {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const initData = WebApp.initData;
    if (!initData) {
      setError('Откройте через Telegram');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath('/api/v1/admin/dashboard'), {
        headers: { 'X-Telegram-Init-Data': initData },
      });
      if (res.status === 403) {
        setError('Доступ только для администратора');
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as AdminDashboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-[var(--tg-viewport-height,100dvh)] bg-[#f5f4fa] px-4 pb-8 pt-[calc(var(--superapp-safe-top,52px)+8px)]">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm"
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">Админ-дашборд</h1>
            <p className="text-xs text-slate-500">Rich Posts · статистика бота</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm disabled:opacity-50"
            aria-label="Обновить"
          >
            <RefreshCw className={`h-5 w-5 text-slate-700 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && !data && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <StatCard label="Всего пользователей" value={data.users_total} icon={<Users className="h-4 w-4" />} />
              <StatCard label="Новых за 24 ч" value={data.users_new_today} />
              <StatCard label="Новых за 7 д" value={data.users_new_week} />
              <StatCard label="Активных за 24 ч" value={data.users_active_today} />
              <StatCard label="Активных за 7 д" value={data.users_active_week} className="col-span-2" />
            </div>

            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Активность</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Metric label="/start" value={data.totals.starts} />
                <Metric label="Редактор" value={data.totals.app_opens} />
                <Metric label="Загрузки" value={data.totals.uploads} />
                <Metric label="Превью" value={data.totals.previews} />
                <Metric label="Публикации" value={data.totals.publishes} />
              </dl>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Недавние пользователи</h2>
              {data.recent_users.length === 0 ? (
                <p className="text-sm text-slate-500">Пока никого нет — ждём /start</p>
              ) : (
                <ul className="space-y-3">
                  {data.recent_users.map((u) => (
                    <li key={u.tg_id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{userLabel(u)}</p>
                          <p className="text-xs text-slate-500">id {u.tg_id}</p>
                        </div>
                        <p className="text-xs text-slate-400">{fmtTime(u.last_seen)}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        app {u.app_opens} · ↑ {u.uploads} · 👁 {u.previews} · 📢 {u.publishes}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-slate-400">
              Обновлено {fmtTime(data.generated_at)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  className = '',
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
