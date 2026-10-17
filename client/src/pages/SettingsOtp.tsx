import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';
import { generateSecret, totp, secondsRemaining, formatSecret } from '@/lib/totp';

const SECRET_KEY = 'mt5-otp-secret';

function getOrCreateSecret(): string {
  try {
    const existing = localStorage.getItem(SECRET_KEY);
    if (existing) return existing;
  } catch {
    /* localStorage недоступен — продолжаем с секретом только на эту сессию */
  }
  const secret = generateSecret();
  try {
    localStorage.setItem(SECRET_KEY, secret);
  } catch {
    /* noop */
  }
  return secret;
}

/**
 * «Настройки → OTP» (заявка заказчика 2026-10-17: раньше была заглушка
 * «Режим просмотра», заказчик подтвердил — "что-нибудь для авторизации и
 * всё"). Настоящий генератор одноразового кода (TOTP, RFC 6238) — код
 * реально меняется каждые 30 секунд, но ни к какой реальной защите
 * аккаунта не привязан (секрет хранится только в этом браузере).
 */
export default function SettingsOtpPage() {
  const navigate = useNavigate();
  const [secret] = useState(getOrCreateSecret);
  const [code, setCode] = useState('------');
  const [remaining, setRemaining] = useState(secondsRemaining());

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      totp(secret).then((c) => {
        if (!cancelled) setCode(c);
      });
      setRemaining(secondsRemaining());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secret]);

  const progress = (remaining / 30) * 100;

  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="OTP" solid left={<BackButton onClick={() => navigate(-1)} />} />
      <div className="mx-4 mt-4 flex flex-col items-center overflow-hidden rounded-[14px] bg-white px-4 py-8">
        <span className="text-[13px] text-text-secondary">Одноразовый пароль</span>
        <span className="tnum mt-2 text-[40px] font-semibold tracking-[0.1em] text-black">
          {code.slice(0, 3)} {code.slice(3)}
        </span>
        <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-fill">
          <div
            className="h-full bg-accent transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] text-text-secondary">Обновится через {remaining} с</p>
      </div>
      <div className="mx-4 mt-3 overflow-hidden rounded-[14px] bg-white px-4 py-4">
        <span className="block text-[13px] text-text-secondary">Ключ для приложения-аутентификатора</span>
        <span className="tnum mt-1 block select-all text-[15px] text-black">{formatSecret(secret)}</span>
      </div>
    </div>
  );
}
