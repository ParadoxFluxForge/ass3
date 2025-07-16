require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const db = require('./db');

const app = express();
app.use(express.json());

// Проверка данных Telegram
function verifyTelegramData(initData) {
  const botToken = process.env.BOT_TOKEN;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const dataToCheck = [];
  
  params.forEach((val, key) => {
    if (key !== 'hash') dataToCheck.push(`${key}=${val}`);
  });
  
  dataToCheck.sort();
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(dataToCheck.join('\n'))
    .digest('hex');
    
  return computedHash === hash;
}

// API endpoints
app.get('/progress', async (req, res) => {
  if (!verifyTelegramData(req.query.initData)) {
    return res.status(403).json({ error: 'Invalid Telegram data' });
  }

  try {
    const params = new URLSearchParams(req.query.initData);
    const user = JSON.parse(params.get('user'));
    const { rows } = await db.query(
      'SELECT score, level FROM user_progress WHERE user_id = $1',
      [user.id]
    );
    res.json(rows[0] || { score: 0, level: 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/progress', async (req, res) => {
  if (!verifyTelegramData(req.query.initData)) {
    return res.status(403).json({ error: 'Invalid Telegram data' });
  }

  try {
    const params = new URLSearchParams(req.query.initData);
    const user = JSON.parse(params.get('user'));
    const { score, level } = req.body;
    
    await db.query(`
      INSERT INTO user_progress (user_id, score, level)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET score = $2, level = $3
    `, [user.id, score, level]);
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Статика для клиента
app.use(express.static('../client'));

// Инициализация БД
async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id BIGINT PRIMARY KEY,
      score INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Database initialized');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);
});
