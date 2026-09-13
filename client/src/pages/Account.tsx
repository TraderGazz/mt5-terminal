import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import AppShell from '@/components/AppShell';
import NavBar, { BackButton } from '@/components/NavBar';
import ActionSheet from '@/components/ActionSheet';
import Toast from '@/components/Toast';
import BrokerLogo from '@/components/auth/BrokerLogo';
import { useAccount } from '@/data/account';

/** Company name with straight quotes, exactly as in MT5 iOS. */
const COMPANY_TITLE = 'ООО "Альфа-Форекс"';

/** Balance caption from the reference (mock ACCOUNT balance is a different snapshot). */
const BALANCE_LABEL = '62 636 454.73 RUB';

const BADGES = [
  { label: 'Read Only', color: '#8E8E93' },
  { label: 'Hedge', color: '#007AFF' },
] as const;

const ROW_CLS =
  'flex h-12 w-full items-center px-4 text-left transition-colors duration-150 active:bg-[#D9D9DE]';

/**
 * Счёт (`/account`) — визуальная копия MT5 iOS: белая шапка с логотипом
 * брокера, ФИО, «логин - сервер», балансом и бейджами Read Only / Demo /
 * Hedge; ниже плоские белые группы на всю ширину. Действия — заглушки.
 */
export default function AccountPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const [toast, setToast] = useState<string | null>(null);
  const [deleteSheet, setDeleteSheet] = useState(false);

  const INFO_ROWS: Array<{ label: string; value: string }> = [
    { label: 'Имя', value: account.holder },
    { label: 'Email', value: '' },
    { label: 'Телефон', value: '' },
    { label: 'Логин', value: String(account.accountId) },
    { label: 'Сервер', value: account.server },
    { label: 'Подключен', value: account.accessServer },
  ];

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
        <NavBar left={<BackButton onClick={() => navigate(-1)} />} />

        {/* White header block */}
        <div className="flex flex-col items-center bg-bg px-4 pb-5 pt-3 text-center">
          <BrokerLogo size={64} />
          <h1 className="mt-3 text-[17px] font-semibold leading-[22px] tracking-[-0.41px] text-black">
            {account.holder}
          </h1>
          <p className="tnum mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-text-secondary">
            {account.accountId} - {account.server}
          </p>
          <p className="tnum text-[13px] leading-[18px] tracking-[-0.08px] text-text-secondary">
            {BALANCE_LABEL}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {BADGES.map((b) => (
              <span
                key={b.label}
                className="rounded-full border px-2.5 py-[1px] text-[13px] leading-[18px]"
                style={{ borderColor: b.color, color: b.color }}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* Компания */}
        <div className="mt-6 bg-bg">
          <button
            type="button"
            onClick={() => setToast('В разработке')}
            className={ROW_CLS}
          >
            <span className="text-[17px] tracking-[-0.41px] text-black">Компания</span>
            <span className="min-w-0 flex-1 truncate text-right text-[17px] tracking-[-0.41px] text-black">
              {COMPANY_TITLE}
            </span>
            <ChevronRight size={16} strokeWidth={2.2} className="ml-1 shrink-0 text-[#C7C7CC]" />
          </button>
        </div>

        {/* Account info */}
        <div className="mt-6 bg-bg">
          {INFO_ROWS.map((row, i) => (
            <div key={row.label}>
              <div className="flex h-12 items-center px-4">
                <span className="shrink-0 text-[17px] tracking-[-0.41px] text-black">
                  {row.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-[17px] tracking-[-0.41px] text-text-secondary">
                  {row.value}
                </span>
              </div>
              {i < INFO_ROWS.length - 1 && (
                <div className="ml-4 border-t-[0.5px] border-separator" />
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 bg-bg">
          <button
            type="button"
            onClick={() => setToast('В разработке')}
            className={ROW_CLS}
          >
            <span className="min-w-0 flex-1 truncate text-[17px] tracking-[-0.41px] text-black">
              Подключить на другом устройстве
            </span>
            <ChevronRight size={16} strokeWidth={2.2} className="ml-1 shrink-0 text-[#C7C7CC]" />
          </button>
          <div className="ml-4 border-t-[0.5px] border-separator" />
          <button
            type="button"
            onClick={() => setDeleteSheet(true)}
            className={ROW_CLS}
          >
            <span className="min-w-0 flex-1 truncate text-[17px] tracking-[-0.41px] text-loss">
              Удалить счет
            </span>
            <ChevronRight size={16} strokeWidth={2.2} className="ml-1 shrink-0 text-[#C7C7CC]" />
          </button>
        </div>

        <div className="h-8" />
      </div>

      <ActionSheet
        open={deleteSheet}
        title="Удалить счет из терминала?"
        actions={[
          {
            label: 'Удалить счет',
            destructive: true,
            onSelect: () => setToast('В разработке'),
          },
        ]}
        onClose={() => setDeleteSheet(false)}
      />
      <Toast message={toast} onClose={() => setToast(null)} />
    </AppShell>
  );
}
