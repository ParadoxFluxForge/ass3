require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');

// Создаем Express-приложение
const app = express();

// Настройка подключения к базе данных PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Разрешаем обработку JSON в запросах
app.use(express.json());

// Настройка статических файлов (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../client')));

// Функция для проверки данных от Telegram
function verifyTelegramData(initData) {
  try {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      console.error('ОШИБКА: Не установлен BOT_TOKEN');
      return false;
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const dataToCheck = [];

    // Формируем данные для проверки
    params.forEach((val, key) => {
      if (key !== 'hash') dataToCheck.push(`${key}=${val}`);
    });

    dataToCheck.sort();
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataToCheck.join('\n'))
      .digest('hex');

    return computedHash === hash;
  } catch (err) {
    console.error('ОШИБКА проверки данных:', err);
    return false;
  }
}

// Обработчик для получения прогресса пользователя
app.get('/api/progress', async (req, res) => {
  try {
    // Проверяем данные авторизации
    if (!req.query.initData || !verifyTelegramData(req.query.initData)) {
      return res.status(401).json({ error: 'Неавторизованный запрос' });
    }

    // Извлекаем ID пользователя
    const user = JSON.parse(new URLSearchParams(req.query.initData).get('user'));
    const userId = user.id;

    // Получаем данные из базы
    const { rows } = await pool.query(
      'SELECT score, level FROM user_progress WHERE user_id = $1',
      [userId]
    );
    
    // Возвращаем данные или значения по умолчанию
    res.json(rows[0] || { score: 0, level: 1 });
  } catch (err) {
    console.error('ОШИБКА при получении прогресса:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обработчик для сохранения прогресса
app.post('/api/progress', async (req, res) => {
  try {
    // Проверяем данные авторизации
    if (!req.query.initData || !verifyTelegramData(req.query.initData)) {
      return res.status(401).json({ error: 'Неавторизованный запрос' });
    }

    // Извлекаем ID пользователя
    const user = JSON.parse(new URLSearchParams(req.query.initData).get('user'));
    const userId = user.id;
    const { score, level } = req.body;

    // Сохраняем в базу данных
    const { rows } = await pool.query(
      `INSERT INTO user_progress (user_id, score, level)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET 
         score = EXCLUDED.score,
         level = EXCLUDED.level,
         last_updated = NOW()
       RETURNING *`,
      [userId, score, level]
    );
    
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('ОШИБКА при сохранении прогресса:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Функция для инициализации базы данных
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        user_id BIGINT PRIMARY KEY,
        score INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS user_progress_idx ON user_progress(user_id);
    `);
    console.log('База данных готова к работе');
  } catch (err) {
    console.error('ОШИБКА инициализации базы данных:', err);
    process.exit(1);
  }
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Обработка завершения работы
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
