const tg = window.Telegram.WebApp;
let score = 0;
let level = 1;

async function loadProgress() {
  const response = await fetch('/progress?' + new URLSearchParams({
    initData: tg.initData
  }));
  
  if (response.ok) {
    const data = await response.json();
    score = data.score || 0;
    level = data.level || 1;
    updateUI();
  }
}

async function saveProgress() {
  await fetch('/progress?' + new URLSearchParams({
    initData: tg.initData
  }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ score, level })
  });
}

function handleTap() {
  score++;
  
  // Level up каждые 100 очков
  if (score >= level * 100) {
    level++;
    score = 0;
    tg.HapticFeedback.notificationOccurred('success');
  } else {
    tg.HapticFeedback.impactOccurred('light');
  }
  
  updateUI();
  saveProgress();
}

function updateUI() {
  document.getElementById('score').textContent = score;
  document.getElementById('level').textContent = level;
}

// Инициализация
tg.expand();
tg.ready();
loadProgress();

document.getElementById('tap-btn').addEventListener('click', handleTap);
