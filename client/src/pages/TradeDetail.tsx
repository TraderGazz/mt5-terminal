import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { motion } from 'framer-motion';
import { Briefcase } from 'lucide-react';
import NavBar, { BackButton } from '@/components/NavBar';
import Toast from '@/components/Toast';
import TypeChip from '@/components/trade/TypeChip';
import DetailRow, { RowGroup } from '@/components/trade/DetailRow';
import { getDeal, useDealsVersion } from '@/mocks-trade/editStore';
import { getSymbolMeta } from '@/mocks/symbols';
import type { Deal } from '@/mocks/history';
import {
  formatDateTime,
  formatMoney,
  formatPrice,
  formatSignedMoney,
  formatVolume,
} from '@/lib/format';

function signedColoredMoney(value: number): { text: string; className: string } {
  return {
    text: formatSignedMoney(value),
    className: value >= 0 ? 'text-profit' : 'text-loss',
  };
}

export default function TradeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const ticket = Number(id);

  // Re-render when the edit store mutates this deal («(изм.)», new values).
  // getDeal is backed by a cache invalidated on mutation — safe to call directly.
  useDealsVersion();
  const deal = getDeal(ticket);

  const [toast, setToast] = useState<string | null>(null);

  // Returning from the editor after a successful save.
  useEffect(() => {
    if ((location.state as { saved?: boolean } | null)?.saved) {
      setToast('Сохранено');
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setToast('Скопировано');
  };

  const digits = deal ? (getSymbolMeta(deal.symbol)?.digits ?? 5) : 5;

  return (
    <div className="flex min-h-full flex-col bg-bg-secondary">
      <NavBar
        title="Сделка"
        subtitle={deal ? `#${deal.ticket}` : undefined}
        left={<BackButton label="Назад" onClick={() => navigate(-1)} />}
      />

      {!deal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
          <Briefcase size={48} strokeWidth={1} className="text-text-secondary" />
          <p className="mt-2 text-[17px] font-semibold text-text-secondary">Сделка не найдена</p>
          <p className="text-[13px] text-text-secondary">Проверьте номер тикета</p>
        </div>
      ) : (
        <DealBody deal={deal} digits={digits} onCopy={copy} onEdit={() => navigate(`/trade/${deal.ticket}/edit`)} />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function DealBody({
  deal,
  digits,
  onCopy,
  onEdit,
}: {
  deal: Deal;
  digits: number;
  onCopy: (value: string) => void;
  onEdit: () => void;
}) {
  const isBalance = deal.type === 'balance';
  const profit = signedColoredMoney(deal.profit);
  const openTime = formatDateTime(deal.openTime);
  const closeTime = formatDateTime(deal.closeTime);

  return (
    <div className="pb-6">
      {/* Hero card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="m-4 rounded-[10px] bg-white p-5 text-center"
      >
        {isBalance ? (
          <div className="text-[20px] font-semibold leading-[24px]">
            {deal.comment || 'Балансовая операция'}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-[20px] font-semibold leading-[24px]">{deal.symbol}</span>
            <TypeChip type={deal.type as 'buy' | 'sell'} />
            <span className="tnum text-[15px] font-medium text-text-secondary">
              {formatVolume(deal.volume)}
            </span>
          </div>
        )}
        <div className={`tnum mt-2 text-[28px] font-semibold leading-[34px] tracking-[-0.5px] ${profit.className}`}>
          {profit.text}
          {deal.isEdited && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="ml-1.5 align-middle text-[12px] font-normal text-text-secondary"
            >
              (изм.)
            </motion.span>
          )}
        </div>
        {!isBalance && (
          <div className="tnum mt-1 text-[13px] leading-[16px] text-text-secondary">
            {formatPrice(deal.openPrice, digits)} → {formatPrice(deal.closePrice, digits)}
          </div>
        )}
      </motion.div>

      {/* Details group */}
      <motion.div
        className="mx-4 mb-4"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.15 }}
      >
        <RowGroup>
          <DetailRow label="Ордер" value={String(deal.order)} copyValue={String(deal.order)} onCopy={onCopy} />
          <DetailRow label="Позиция" value={String(deal.positionId)} copyValue={String(deal.positionId)} onCopy={onCopy} />
          <DetailRow label="Сделка" value={String(deal.ticket)} copyValue={String(deal.ticket)} onCopy={onCopy} />
          <DetailRow label="Время открытия" value={openTime} copyValue={openTime} onCopy={onCopy} />
          <DetailRow label="Время закрытия" value={closeTime} copyValue={closeTime} onCopy={onCopy} />
          {!isBalance && (
            <DetailRow
              label="Тип"
              value={deal.type}
              copyValue={deal.type}
              onCopy={onCopy}
              valueClassName={deal.type === 'buy' ? 'text-accent' : 'text-loss'}
            />
          )}
          {!isBalance && (
            <DetailRow label="Символ" value={deal.symbol} copyValue={deal.symbol} onCopy={onCopy} />
          )}
          {!isBalance && (
            <DetailRow
              label="Цена открытия"
              value={formatPrice(deal.openPrice, digits)}
              copyValue={formatPrice(deal.openPrice, digits)}
              onCopy={onCopy}
            />
          )}
          {!isBalance && (
            <DetailRow
              label="Цена закрытия"
              value={formatPrice(deal.closePrice, digits)}
              copyValue={formatPrice(deal.closePrice, digits)}
              onCopy={onCopy}
            />
          )}
          {!isBalance && (
            <DetailRow
              label="Объём"
              value={formatVolume(deal.volume)}
              copyValue={formatVolume(deal.volume)}
              onCopy={onCopy}
            />
          )}
          <DetailRow
            label="Прибыль"
            value={profit.text}
            copyValue={profit.text}
            onCopy={onCopy}
            valueClassName={profit.className}
          />
          {!isBalance && (
            <DetailRow
              label="CFD"
              value={formatMoney(0)}
              copyValue={formatMoney(0)}
              onCopy={onCopy}
            />
          )}
          <DetailRow
            label="Своп"
            value={formatMoney(deal.swap)}
            copyValue={formatMoney(deal.swap)}
            onCopy={onCopy}
            valueClassName={deal.swap < 0 ? 'text-loss' : ''}
          />
          <DetailRow
            label="Комиссия"
            value={formatMoney(deal.commission)}
            copyValue={formatMoney(deal.commission)}
            onCopy={onCopy}
            valueClassName={deal.commission < 0 ? 'text-loss' : ''}
          />
          <DetailRow
            label="Комментарий"
            value={deal.comment || '—'}
            copyValue={deal.comment || undefined}
            onCopy={deal.comment ? onCopy : undefined}
            last
          />
        </RowGroup>
      </motion.div>

      {/* Edit button */}
      <div className="mx-4 mt-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97, opacity: 0.85 }}
          transition={{ duration: 0.12 }}
          onClick={onEdit}
          className="h-[50px] w-full rounded-[12px] bg-accent text-[17px] font-semibold text-white"
        >
          Редактировать
        </motion.button>
      </div>
    </div>
  );
}
