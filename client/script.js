class TapGame {
  constructor() {
    // Инициализация Telegram WebApp
    this.tg = window.Telegram.WebApp;
    this.tg.expand();
    this.tg.enableClosingConfirmation();
    
    // Игровые данные
    this.score = 0;
    this.level = 1;
    this.userId = this.tg.initDataUnsafe.user?.id;
    
    // Флаги состояния
    this.isSaving = false;
    this.pendingSave = false;
    this.forceSaveRequested = false;

    // Инициализация
    this.init();
  }

  async init() {
    if (!this.validateUser()) return;
    
    await this.loadProgress();
    this.setupEventListeners();
    this.setupBeforeUnload();
  }

  validateUser() {
    if (!this.userId) {
      this.showError("Откройте игру через Telegram бота");
      return false;
    }
    return true;
  }

  setupEventListeners() {
    // Основной обработчик кликов
    document.getElementById('tap-btn').addEventListener('click', () => {
      this.handleTap();
    });

    // Сохранение при изменении видимости
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.forceSave();
      }
    });

    // Периодическое сохранение
    this.saveInterval = setInterval(() => {
      if (this.pendingSave) {
        this.saveProgress();
      }
    }, 3000);
  }

  setupBeforeUnload() {
    // Обработчик закрытия страницы
    window.addEventListener('beforeunload', (e) => {
      if (this.pendingSave && !this.forceSaveRequested) {
        e.preventDefault();
        e.returnValue = '';
        this.forceSave();
      }
    });
  }

  async forceSave() {
    if (this.isSaving) return;
    
    this.forceSaveRequested = true;
    console.log("Выполняю принудительное сохранение...");
    
    try {
      await this.saveProgress(true);
      console.log("Прогресс успешно сохранен");
      this.tg.close();
    } catch (err) {
      console.error("Ошибка при сохранении:", err);
    }
  }

  handleTap() {
    this.score++;
    this.pendingSave = true;
    
    // Проверка уровня
    if (this.score >= this.level * 100) {
      this.level++;
      this.score = 0;
      this.tg.HapticFeedback.notificationOccurred('success');
      this.showLevelUp();
    } else {
      this.tg.HapticFeedback.impactOccurred('light');
    }
    
    this.updateUI();
    this.debouncedSave();
  }

  async loadProgress() {
    try {
      const response = await fetch(`/api/progress?initData=${encodeURIComponent(this.tg.initData)}`);
      
      if (!response.ok) throw new Error("Ошибка загрузки");
      
      const data = await response.json();
      this.score = data.score || 0;
      this.level = data.level || 1;
      this.updateUI();
    } catch (err) {
      console.error("Ошибка загрузки прогресса:", err);
    }
  }

  async saveProgress(force = false) {
    if (this.isSaving && !force) return;
    
    this.isSaving = true;
    try {
      const response = await fetch(`/api/progress?initData=${encodeURIComponent(this.tg.initData)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: this.score,
          level: this.level
        })
      });
      
      if (response.ok) {
        this.pendingSave = false;
        return true;
      }
      throw new Error("Сервер вернул ошибку");
    } catch (err) {
      console.error("Ошибка сохранения:", err);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  updateUI() {
    document.getElementById('score').textContent = this.score;
    document.getElementById('level').textContent = this.level;
  }

  showLevelUp() {
    const levelElement = document.getElementById('level');
    levelElement.classList.add('level-up');
    setTimeout(() => {
      levelElement.classList.remove('level-up');
    }, 1000);
  }

  showError(message) {
    alert(message);
    document.getElementById('tap-btn').disabled = true;
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

// Инициализация игры
document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram && window.Telegram.WebApp) {
    new TapGame();
  } else {
    alert("Пожалуйста, откройте игру через Telegram");
  }
});
