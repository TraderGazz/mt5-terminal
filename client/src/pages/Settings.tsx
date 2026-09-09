import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import NavBar from '@/components/NavBar';
import ActionSheet from '@/components/ActionSheet';
import SettingsRow, { type SettingsRowDef } from '@/components/settings/SettingsRow';
import StubModal from '@/components/settings/StubModal';
import {
  IconAlgo,
  IconCharts,
  IconChat,
  IconCommunity,
  IconInterface,
  IconJournal,
  IconMail,
  IconNewAccount,
  IconNews,
  IconOtp,
  IconTradays,
} from '@/components/settings/icons';
import { useAccount } from '@/data/account';

const IOS_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/** First-mount stagger happens only once per session (design.md §6). */
let hasMountedOnce = false;

/** Company name with straight quotes, exactly as in MT5 iOS. */
const COMPANY_TITLE = 'ООО "Альфа-Форекс"';

/**
 * Menu rows (MT5 iOS «Настройки»). Group 1 renders inside the profile card;
 * groups 2/3 are separate white cards. Icons are self-contained SVG squares
 * traced from the original app.
 */
const GROUP_1: SettingsRowDef[] = [
  { key: 'new-account', label: 'Новый счет', icon: IconNewAccount },
  {
    key: 'mail',
    label: 'Почта',
    icon: IconMail,
    subtext: 'Добро пожаловать в торговую плат…',
  },
  {
    key: 'news',
    label: 'Новости',
    icon: IconNews,
    subtext: 'Порт Хорфаккан в ОАЭ принял перв…',
  },
  {
    key: 'tradays',
    label: 'Tradays',
    icon: IconTradays,
    subtext: 'Экономический календарь',
  },
];

const GROUP_2: SettingsRowDef[] = [
  {
    key: 'chat',
    label: 'Чат и сообщения',
    icon: IconChat,
    subtext: 'Войдите в аккаунт MQL5.community!',
  },
  { key: 'community', label: 'Сообщество трейдеров', icon: IconCommunity },
  { key: 'mql5', label: 'MQL5 Algo Trading', icon: IconAlgo },
];

const GROUP_3: SettingsRowDef[] = [
  {
    key: 'otp',
    label: 'OTP',
    icon: IconOtp,
    subtext: 'Генератор одноразовых паролей',
  },
  { key: 'interface', label: 'Интерфейс', icon: IconInterface, subtext: 'Русский' },
  { key: 'charts', label: 'Чарты', icon: IconCharts },
  { key: 'journal', label: 'Журнал', icon: IconJournal },
];

/** White inset-grouped card shell (MT5: 20px side margins, ~20px radius). */
const CARD_CLS = 'mx-5 overflow-hidden rounded-[20px] bg-white';

/**
 * Настройки (`/settings`) — визуальная копия MT5 iOS: карточка профиля
 * (тап → `/account`), далее белые карточки-группы. Все пункты — заглушки
 * «В разработке»; «Интерфейс» открывает ActionSheet с языком.
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const [stub, setStub] = useState<SettingsRowDef | null>(null);
  const [langSheet, setLangSheet] = useState(false);

  const [firstMount] = useState(() => {
    const first = !hasMountedOnce;
    hasMountedOnce = true;
    return first;
  });

  const onRowTap = (row: SettingsRowDef) => {
    if (row.key === 'interface') {
      setLangSheet(true);
    } else {
      setStub(row);
    }
  };

  const enter = (delay: number) => ({
    initial: firstMount ? ({ opacity: 0, y: 16 } as const) : false,
    animate: { opacity: 1, y: 0 } as const,
    transition: { duration: 0.3, delay, ease: IOS_EASE },
  });

  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      {/* Title stays pinned at the top; `solid` keeps scrolled content
          (profile card etc.) from showing through the transparent bar. */}
      <NavBar title="Настройки" solid />

      {/* Profile card + group 1 (single white card, as in MT5 iOS) */}
      <motion.div {...enter(0)} className={`relative mt-2 ${CARD_CLS}`}>
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="relative flex w-full items-center px-5 pb-[10px] pt-[11px] text-left transition-colors duration-150 active:bg-[#D9D9DE]"
        >
          <span className="min-w-0 flex-1 text-center">
            <span className="block truncate text-[17px] font-medium leading-[20px] tracking-[-0.41px] text-black">
              {account.holder}
            </span>
            <span className="block truncate text-[15px] leading-[20px] tracking-[-0.24px] text-black">
              {COMPANY_TITLE}
            </span>
            <span className="tnum mt-[5px] block truncate text-[15px] leading-[20px] tracking-[-0.24px] text-black">
              {account.accountId} - {account.server}
            </span>
            <span className="block truncate text-[15px] leading-[20px] tracking-[-0.24px] text-black">
              {account.accessServer}
            </span>
          </span>
          <ChevronRight
            size={15}
            strokeWidth={2.2}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-[#C7C7CC]"
          />
        </button>
        {/* Hairline under the profile block: inset to the icon's right edge
            and 20px from the card edge, as in MT5 iOS. */}
        <div className="ml-[51px] mr-5 border-t-[0.5px] border-separator" />
        {GROUP_1.map(({ key, ...row }, i) => (
          <SettingsRow
            key={key}
            {...row}
            last={i === GROUP_1.length - 1}
            onClick={() => onRowTap({ key, ...row })}
          />
        ))}
      </motion.div>

      {/* Menu group 2 */}
      <motion.div {...enter(0.08)} className={`mt-3 ${CARD_CLS}`}>
        {GROUP_2.map(({ key, ...row }, i) => (
          <SettingsRow
            key={key}
            {...row}
            last={i === GROUP_2.length - 1}
            onClick={() => onRowTap({ key, ...row })}
          />
        ))}
      </motion.div>

      {/* Menu group 3 */}
      <motion.div {...enter(0.16)} className={`mb-4 mt-3 ${CARD_CLS}`}>
        {GROUP_3.map(({ key, ...row }, i) => (
          <SettingsRow
            key={key}
            {...row}
            last={i === GROUP_3.length - 1}
            onClick={() => onRowTap({ key, ...row })}
          />
        ))}
      </motion.div>

      <StubModal row={stub} onClose={() => setStub(null)} />
      <ActionSheet
        open={langSheet}
        title="Язык интерфейса"
        actions={[
          { label: 'Русский ✓' },
          { label: 'English (скоро)', disabled: true },
        ]}
        onClose={() => setLangSheet(false)}
      />
    </div>
  );
}
