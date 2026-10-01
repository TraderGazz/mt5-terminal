// Вход в ПК-терминал — тот же контракт, что и у мобильной версии
// (POST /api/auth/login), токен хранится под теми же ключами, что в live.js.
const API_URL = '/api';
const TOKEN_KEY = 'mt5pc-token';
const USER_KEY = 'mt5pc-user';

if (localStorage.getItem(TOKEN_KEY)) location.replace('index.html');

const form = document.getElementById('loginForm');
const errorEl = document.getElementById('error');
const submitBtn = document.getElementById('submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  submitBtn.disabled = true;
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: document.getElementById('login').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token) throw new Error(data?.error || 'Неверный логин или пароль');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    location.replace('index.html');
  } catch (err) {
    errorEl.textContent = err.message || 'Нет связи с сервером';
    submitBtn.disabled = false;
  }
});
