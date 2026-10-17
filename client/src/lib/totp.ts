/**
 * Настоящий TOTP-генератор (RFC 6238 / RFC 4226) для «Настройки → OTP»
 * (заявка заказчика 2026-10-17: "что-нибудь для авторизации и всё" — не
 * привязан к реальной защите аккаунта, но код реально меняется каждые 30с
 * по стандартному алгоритму, как в настоящих приложениях-аутентификаторах).
 * Секрет хранится локально в этом браузере (localStorage), генерируется
 * один раз при первом открытии вкладки.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(secret: string): Uint8Array {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export function generateSecret(length = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

function counterToBytes(counter: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Числа ограничены Number.MAX_SAFE_INTEGER — для счётчика 30-секундных
  // окон этого хватит на тысячи лет вперёд, можно писать как две 32-битные половины.
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter % 2 ** 32);
  return new Uint8Array(buf);
}

async function hotp(secret: string, counter: number, digits = 6): Promise<string> {
  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterToBytes(counter).buffer as ArrayBuffer));
  const offset = sig[sig.length - 1] & 0xf;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  const code = (binary % 10 ** digits).toString().padStart(digits, '0');
  return code;
}

const STEP_SECONDS = 30;

export async function totp(secret: string, digits = 6): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  return hotp(secret, counter, digits);
}

export function secondsRemaining(): number {
  const now = Date.now() / 1000;
  return STEP_SECONDS - (Math.floor(now) % STEP_SECONDS);
}

export function formatSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}
