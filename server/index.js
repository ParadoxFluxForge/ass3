require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Подключение к БД с таймаутом
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Проверка данных Telegram
function verifyTelegramData(data) {
  const botToken = process.env.BOT_TOKEN;
  const checkString = Object.keys(data)
    .filter(key => key !== 'hash')
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');
  
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');
    
  return hash === data.hash;
}

// Middleware для проверки пользователя
app.use((req, res, next) => {
  if (!req.query.initData) return res.status(401).send('Unauthorized');
  
  const params = new URLSearchParams(req.query.initData);
  const user = JSON.parse(params.get('user'));
  req.userId = user.id;
  
  if (!verifyTelegramData(Object.fromEntries(params))) {
    return res.status(403).send('Invalid Telegram data');
  }
  
  next();
});

// Получение прогресса
app.get('/progress', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT score, level FROM user_progress WHERE user_id = $1',
      [req.userId]
    );
    
    res.json(rows[0] || { score: 0, level: 1 });
  } catch (err) {
    console.error('GET Progress Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Сохранение прогресса
app.post('/progress', async (req, res) => {
  try {
    const { score, level } = req.body;
    
    await pool.query(`
      INSERT INTO user_progress (user_id, score, level)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET 
        score = EXCLUDED.score,
        level = EXCLUDED.level,
        last_updated = NOW()
      RETURNING *
    `, [req.userId, score, level]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('POST Progress Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Инициализация БД
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        user_id BIGINT PRIMARY KEY,
        score INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_id ON user_progress(user_id);
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database init error:', err);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);
});

// Обработка закрытия сервера
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
