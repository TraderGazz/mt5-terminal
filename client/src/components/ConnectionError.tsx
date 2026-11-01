import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { API_URL } from '@/config';
import { getToken } from '@/api/auth';
import { checkConnection } from '@/lib/connectionCheck';

export default function ConnectionError() {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);
  const check = async () => {
    if (checking) return;
    setChecking(true); setCopied(false);
    try {
      setReport(await checkConnection({ origin: window.location.origin, apiBase: API_URL, token: getToken() }));
    } catch { setReport('Не удалось выполнить проверку. Попробуйте открыть сайт в Safari.'); }
    finally { setChecking(false); }
  };
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 bg-white px-8 text-center">
      <WifiOff size={40} strokeWidth={1.5} className="text-text-secondary" />
      <p className="mt-2 text-[17px] font-semibold text-text-secondary">Нет соединения с сервером</p>
      <p className="text-[13px] text-text-secondary">Попробуйте обновить страницу через некоторое время</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-3 text-[15px] text-accent">Обновить страницу</button>
      <button type="button" disabled={checking} onClick={() => { void check(); }} className="text-[15px] text-accent disabled:opacity-50">
        {checking ? 'Проверяем подключение…' : 'Проверить подключение'}
      </button>
      {report && <>
        <textarea aria-label="Результат проверки подключения" readOnly value={report} rows={9} className="mt-2 w-full max-w-md rounded-lg border border-separator p-2 text-left text-[12px]" />
        <button type="button" className="text-[15px] text-accent" onClick={async () => {
          try { await navigator.clipboard.writeText(report); setCopied(true); }
          catch { setCopied(false); }
        }}>{copied ? 'Скопировано' : 'Скопировать результат'}</button>
      </>}
    </div>
  );
}
