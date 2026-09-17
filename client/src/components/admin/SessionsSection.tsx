/**
 * Admin → Сессии: список активных входов (устройств) с возможностью
 * кикнуть одно устройство на экран входа, либо все разом — кнопка SOS
 * (заявка заказчика: красная, кикает моментально, включая того, кто нажал).
 *
 * Технически: JWT сам по себе на сервере не отслеживается (stateless) —
 * при логине заводится строка в sessions, её id зашивается в токен;
 * authRequired на каждый запрос проверяет, что сессия ещё не отозвана.
 * Кик = revoked=true — следующий же запрос с этим токеном получит 401 и
 * фронт (api/http.ts) сам уведёт на страницу входа.
 */
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { getAuthUser } from '@/api/auth';
import { getSessions, revokeSession, revokeAllSessions, type ApiSession } from '@/api/admin';
import { AdminButton, AdminCard, AdminModal, Pill } from './bits';

const ROLE_TONE: Record<string, 'blue' | 'green' | 'gray'> = {
  admin: 'blue',
  trader: 'green',
  viewer: 'gray',
};

/** Грубый парсинг User-Agent без библиотек — достаточно, чтобы отличить одно устройство от другого. */
function deviceLabel(ua: string | null): string {
  if (!ua) return 'Неизвестное устройство';
  const os = ua.includes('iPhone') || ua.includes('iPad')
    ? 'iOS'
    : ua.includes('Android')
      ? 'Android'
      : ua.includes('Windows')
        ? 'Windows'
        : ua.includes('Mac OS')
          ? 'macOS'
          : ua.includes('Linux')
            ? 'Linux'
            : 'Устройство';
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('Chrome/')
      ? 'Chrome'
      : ua.includes('Firefox/')
        ? 'Firefox'
        : ua.includes('Safari/')
          ? 'Safari'
          : 'браузер';
  return `${browser} · ${os}`;
}

export default function SessionsSection({ showToast }: { showToast: (msg: string) => void }) {
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<ApiSession | null>(null);
  const selfId = getAuthUser()?.id;

  const load = () => {
    getSessions()
      .then((rows) => { setSessions(rows); setError(null); })
      .catch((err: Error) => setError(err.message || 'Не удалось загрузить сессии'));
  };

  useEffect(load, []);

  const doSos = () => {
    setSosOpen(false);
    revokeAllSessions()
      .then((r) => showToast(`Все сессии завершены (${r.revoked})`))
      .catch((err: Error) => showToast(err.message || 'Не удалось выполнить SOS'))
      .finally(load);
  };

  const doKick = () => {
    if (!kickTarget) return;
    const target = kickTarget;
    setKickTarget(null);
    revokeSession(target.id)
      .then(() => {
        setSessions((prev) => (prev ?? []).filter((s) => s.id !== target.id));
        showToast(`Устройство отключено: ${target.name || target.login}`);
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось отключить устройство'));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">Сессии</h1>
        <button
          type="button"
          onClick={() => setSosOpen(true)}
          className="inline-flex h-[42px] items-center gap-2 rounded-[10px] bg-loss px-5 text-[15px] font-bold text-white shadow-[0_2px_10px_rgba(255,59,48,0.35)] transition active:scale-[0.97] active:opacity-90"
        >
          <AlertTriangle size={18} />
          SOS — выйти всем
        </button>
      </div>

      {error && <AdminCard className="p-6 text-center text-[14px] text-loss">{error}</AdminCard>}
      {!error && !sessions && (
        <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Загрузка…</AdminCard>
      )}

      {sessions && (
        <AdminCard className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3 font-medium">Пользователь</th>
                <th className="px-4 py-3 font-medium">Устройство</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Последняя активность</th>
                <th className="px-4 py-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-separator/60 last:border-0 hover:bg-[#F7F7FA]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] text-black">{s.name || s.login}</span>
                      <Pill tone={ROLE_TONE[s.role] ?? 'gray'}>{s.role}</Pill>
                      {s.user_id === selfId && (
                        <span className="text-[11px] text-text-secondary">(вы)</span>
                      )}
                    </div>
                    <span className="tnum block text-[12px] text-text-secondary">логин {s.login}</span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">{deviceLabel(s.user_agent)}</td>
                  <td className="tnum px-4 py-3 text-[13px] text-text-secondary">{s.ip || '—'}</td>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-[13px] text-text-secondary">
                    {formatDateTime(new Date(s.last_seen_at).getTime())}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AdminButton variant="destructive" onClick={() => setKickTarget(s)}>
                      Кикнуть
                    </AdminButton>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[14px] text-text-secondary">
                    Нет активных сессий
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </AdminCard>
      )}

      {/* SOS confirm */}
      <AdminModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        title="Выйти всем сейчас?"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setSosOpen(false)}>
              Отмена
            </AdminButton>
            <AdminButton variant="destructive" onClick={doSos}>
              Да, выйти всем
            </AdminButton>
          </>
        }
      >
        <p className="text-[14px] leading-[20px] text-black">
          Все, кто сейчас залогинен на сайте (включая вас), будут мгновенно
          перекинуты на экран входа. Действие нельзя отменить — только
          войти заново.
        </p>
      </AdminModal>

      {/* Single kick confirm */}
      <AdminModal
        open={kickTarget !== null}
        onClose={() => setKickTarget(null)}
        title="Отключить устройство?"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setKickTarget(null)}>
              Отмена
            </AdminButton>
            <AdminButton variant="destructive" onClick={doKick}>
              Отключить
            </AdminButton>
          </>
        }
      >
        {kickTarget && (
          <p className="text-[14px] text-black">
            {kickTarget.name || kickTarget.login} ({deviceLabel(kickTarget.user_agent)}) будет
            перекинут на экран входа при следующем действии на сайте.
          </p>
        )}
      </AdminModal>
    </div>
  );
}
