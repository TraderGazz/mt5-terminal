/**
 * Placeholder pages for routes owned by other agents. Each tab stub renders
 * its own NavBar (chrome contract: see Layout.tsx). Replace these with the
 * real pages.
 */
import NavBar from '@/components/NavBar';

function TabStub({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-full flex-col bg-bg">
      <NavBar title={title} subtitle={subtitle} />
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
        <p className="text-[17px] font-semibold text-text-secondary">{title}</p>
        <p className="text-[13px] text-text-secondary">Раздел в разработке</p>
      </div>
    </div>
  );
}

export function ChartStub() {
  return <TabStub title="Чарт" />;
}

export function TradeStub() {
  return <TabStub title="Торговля" />;
}

export function TradeDetailStub() {
  return <TabStub title="Сделка" />;
}

export function TradeEditStub() {
  return <TabStub title="Редактирование" />;
}

export function HistoryStub() {
  return <TabStub title="История" />;
}

export function HistoryPeriodStub() {
  return <TabStub title="Период" />;
}

export function SettingsStub() {
  return <TabStub title="Настройки" />;
}

/** Login — no app chrome (design.md: TabBar/NavBar hidden). */
export function LoginStub() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-1 bg-bg-secondary px-8">
      <p className="text-[17px] font-semibold text-text-secondary">Авторизация</p>
      <p className="text-[13px] text-text-secondary">Раздел в разработке</p>
    </div>
  );
}

/** Admin — responsive desktop-capable layout, no phone chrome. */
export function AdminStub() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-1 bg-bg-secondary px-8">
      <p className="text-[17px] font-semibold text-text-secondary">Админ-панель</p>
      <p className="text-[13px] text-text-secondary">Раздел в разработке</p>
    </div>
  );
}

/** Embeds — bare pages for iframes, no app chrome. */
export function EmbedTradeStub() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-1 bg-bg px-8">
      <p className="text-[13px] text-text-secondary">Встройка «Торговля» — в разработке</p>
    </div>
  );
}

export function EmbedHistoryStub() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-1 bg-bg px-8">
      <p className="text-[13px] text-text-secondary">Встройка «История» — в разработке</p>
    </div>
  );
}
