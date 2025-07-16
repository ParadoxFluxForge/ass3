class TapGame {
  constructor() {
    this.tg = window.Telegram.WebApp;
    this.initData = this.tg.initData;
    
    if (!this.validateInitData()) {
      this.showError('Please open through Telegram');
      return;
    }

    this.initializeGame();
  }

  validateInitData() {
    if (!this.tg.initDataUnsafe?.user) {
      console.error('No user data in initData');
      return false;
    }
    return true;
  }

  async initializeGame() {
    this.tg.expand();
    this.tg.enableClosingConfirmation();
    
    this.userId = this.tg.initDataUnsafe.user.id;
    this.score = 0;
    this.level = 1;
    this.pendingSave = false;

    await this.loadProgress();
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('tap-btn').addEventListener('click', () => {
      this.handleTap();
    });

    window.addEventListener('beforeunload', () => {
      this.saveProgress(true);
    });

    setInterval(() => this.saveProgress(), 5000);
  }

  async loadProgress() {
    try {
      const params = new URLSearchParams({ initData: this.initData });
      const response = await fetch(`/api/progress?${params}`);
      
      if (!response.ok) throw new Error('Network error');
      
      const data = await response.json();
      this.score = data.score;
      this.level = data.level;
      this.updateUI();
    } catch (err) {
      console.error('Load error:', err);
    }
  }

  async saveProgress(immediate = false) {
    if (this.pendingSave && !immediate) return;
    
    this.pendingSave = true;
    try {
      const params = new URLSearchParams({ initData: this.initData });
      const response = await fetch(`/api/progress?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: this.score,
          level: this.level
        })
      });
      
      if (!response.ok) throw new Error('Save failed');
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      this.pendingSave = false;
    }
  }

  handleTap() {
    this.score++;
    
    if (this.score >= this.level * 100) {
      this.levelUp();
    } else {
      this.tg.HapticFeedback.impactOccurred('light');
    }
    
    this.updateUI();
    this.debouncedSave();
  }

  levelUp() {
    this.level++;
    this.score = 0;
    this.tg.HapticFeedback.notificationOccurred('success');
    this.tg.showAlert(`Level ${this.level} reached!`);
  }

  updateUI() {
    document.getElementById('score').textContent = this.score;
    document.getElementById('level').textContent = this.level;
  }

  showError(message) {
    document.getElementById('tap-btn').disabled = true;
    alert(message);
  }

  debouncedSave = this.debounce(() => this.saveProgress(), 1000);

  debounce(func, wait) {
    let timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(), wait);
    };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram && window.Telegram.WebApp) {
    new TapGame();
  } else {
    alert('Please open through Telegram');
  }
});
