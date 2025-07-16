require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// Настройка подключения к PostgreSQL с таймаутами
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Валидация данных Telegram WebApp
function validateTelegramInitData(initData) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error('BOT_TOKEN is not configured');
    return false;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const dataToCheck = [];
    
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
    console.error('Validation error:', err);
    return false;
  }
}

// Middleware для авторизации
app.use('/api', (req, res, next) => {
  if (!req.query.initData) {
    console.warn('No initData provided');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!validateTelegramInitData(req.query.initData)) {
    console.warn('Invalid Telegram auth');
    return res.status(403).json({ error: 'Invalid Telegram data' });
  }

  try {
    const user = JSON.parse(new URLSearchParams(req.query.initData).get('user'));
    req.userId = user.id;
    next();
  } catch (err) {
    console.error('User parsing error:', err);
    return res.status(400).json({ error: 'Bad request' });
  }
});

// Роуты API
app.get('/api/progress', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT score, level FROM user_progress 
       WHERE user_id = $1`,
      [req.userId]
    );
    
    res.json(rows[0] || { score: 0, level: 1 });
  } catch (err) {
    console.error('GET Progress Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/progress', async (req, res) => {
  try {
    const { score, level } = req.body;
    
    const { rows } = await pool.query(
      `INSERT INTO user_progress (user_id, score, level)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         score = EXCLUDED.score,
         level = EXCLUDED.level,
         last_updated = NOW()
       RETURNING *`,
      [req.userId, score, level]
    );
    
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('POST Progress Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Статика для клиента
app.use(express.static(path.join(__dirname, '../client')));

// Инициализация БД
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
    console.log('Database initialized');
  } catch (err) {
    console.error('Database init error:', err);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
