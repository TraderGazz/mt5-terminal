/**
 * GET /api/news — реальная лента финансовых новостей (заявка заказчика:
 * «Настройки → Новости» была декоративной заглушкой). Источник — публичный
 * RSS FXStreet (без ключа, без регистрации); парсим вручную регуляркой
 * вместо подключения XML-библиотеки — формат RSS простой и стабильный,
 * доп. зависимость ради этого не нужна.
 */
import { Router } from 'express';
import { authRequired } from './auth.js';

const router = Router();

const FEED_URL = 'https://www.fxstreet.com/rss/news';
const CACHE_MS = 5 * 60_000; // лента обновляется нечасто — не дёргаем источник на каждый заход
let cache = { at: 0, items: [] };

function extractTag(tag, block) {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`));
  return m ? (m[1] ?? m[2] ?? '').trim() : '';
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const title = extractTag('title', block);
    const link = extractTag('link', block);
    const pubDate = extractTag('pubDate', block);
    const description = extractTag('description', block);
    const imageMatch = block.match(/<enclosure url="([^"]+)"/);
    if (title && link) {
      items.push({ title, link, pubDate, description, image: imageMatch?.[1] || null });
    }
  }
  return items;
}

router.get('/', authRequired, async (req, res) => {
  try {
    if (Date.now() - cache.at > CACHE_MS) {
      const r = await fetch(FEED_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = await r.text();
      cache = { at: Date.now(), items: parseRss(xml).slice(0, 30) };
    }
    res.json({ items: cache.items });
  } catch (err) {
    console.error('[news] error:', err.message);
    // Отдаём последний удачный кэш, если он есть, вместо голой ошибки —
    // лента новостей не настолько критична, чтобы ломать страницу из-за
    // одного неудачного запроса к источнику.
    if (cache.items.length) return res.json({ items: cache.items, stale: true });
    res.status(502).json({ error: 'Не удалось получить новости' });
  }
});

export default router;
