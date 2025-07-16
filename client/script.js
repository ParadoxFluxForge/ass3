class TapGame {
  constructor() {
    this.tg = window.Telegram.WebApp;
    this.tg.expand();
    this.tg.enableClosingConfirmation();
    
    this.score = 0;
    this.level = 1;
    this.userId = this.tg.initDataUnsafe.user.id;
    this.isSaving = false;
    
    this.init();
  }
  
  async init() {
    await this.loadProgress();
    this.setupEvents();
  }
  
  setupEvents() {
    document.getElementById('tap-btn').addEventListener('click', () => {
      this.handleTap();
    });
    
    // Сохранение при закрытии
    this.tg.onEvent('viewportChanged', (event) => {
      if (event.isStateStable && this.tg.isClosingConfirmationEnabled) {
        this.saveProgress(true);
      }
    });
    
    // Сохранение каждые 5 секунд
    setInterval(() => this.saveProgress(), 5000);
  }
  
  async loadProgress() {
    try {
      const params = new URLSearchParams({ initData: this.tg.initData });
      const response = await fetch(`/progress?${params}`);
      
      if (!response.ok) throw new Error('Network error');
      
      const data = await response.json();
      this.score = data.score;
      this.level = data.level;
      this.updateUI();
    } catch (err) {
      console.error('Load progress error:', err);
    }
  }
  
  async saveProgress(force = false) {
    if (this.isSaving && !force) return;
    
    this.isSaving = true;
    try {
      const params = new URLSearchParams({ initData: this.tg.initData });
      const response = await fetch(`/progress?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: this.score,
          level: this.level
        })
      });
      
      if (!response.ok) throw new Error('Save failed');
    } catch (err) {
      console.error('Save progress error:', err);
    } finally {
      this.isSaving = false;
    }
  }
  
  handleTap() {
    this.score++;
    
    // Level up
    if (this.score >= this.level * 100) {
      this.level++;
      this.score = 0;
      this.tg.HapticFeedback.notificationOccurred('success');
    } else {
      this.tg.HapticFeedback.impactOccurred('light');
    }
    
    this.updateUI();
    
    // Сохраняем после каждого клика (с дебаунсом)
    this.debouncedSave();
  }
  
  updateUI() {
    document.getElementById('score').textContent = this.score;
    document.getElementById('level').textContent = this.level;
  }
  
  // Оптимизация: сохраняем не чаще чем раз в секунду
  debouncedSave = this.debounce(() => this.saveProgress(), 1000);
  
  debounce(func, wait) {
    let timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(func, wait);
    };
  }
}

// Запуск игры
document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram.WebApp.initDataUnsafe.user) {
    new TapGame();
  } else {
    alert('Откройте игру через Telegram бота');
    document.getElementById('tap-btn').disabled = true;
  }
});
