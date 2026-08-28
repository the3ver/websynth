/**
 * RETROVOX SUB-1 & RETROBEAT D-909 • PWA MANAGER
 * Handles Service Worker registration, install prompts, standalone UI adaptation,
 * offline status detection, and Screen Wake Lock for live studio performance.
 */

class PWAManager {
  constructor(audioEngine, drumEngine, drumUI) {
    this.audioEngine = audioEngine;
    this.drumEngine = drumEngine;
    this.drumUI = drumUI;

    this.deferredPrompt = null;
    this.isStandalone = false;
    this.wakeLock = null;

    // DOM Elements
    this.installBtn = document.getElementById('pwaInstallBtn');
    this.pwaModal = document.getElementById('pwaModal');
    this.pwaModalCloseBtn = document.getElementById('closePwaModalBtn');
    this.modalInstallBtn = document.getElementById('modalInstallBtn');
    this.pwaStatusBadge = document.getElementById('pwaStatusBadge');
    this.updateToast = document.getElementById('pwaUpdateToast');
    this.updateReloadBtn = document.getElementById('pwaUpdateReloadBtn');

    this.init();
  }

  init() {
    this.checkStandaloneMode();
    this.registerServiceWorker();
    this.setupInstallPrompt();
    this.setupNetworkStatusWatcher();
    this.setupWakeLockHandler();
    this.setupModalEvents();
    this.handleShortcutsHash();
  }

  /**
   * Check if running in standalone display mode (installed PWA)
   */
  checkStandaloneMode() {
    const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator.standalone === true;
    this.isStandalone = isStandaloneDisplay || isIOSStandalone;

    if (this.isStandalone) {
      document.body.classList.add('is-pwa-standalone');
      if (this.installBtn) {
        this.installBtn.style.display = 'none';
      }
      if (this.pwaStatusBadge) {
        const dot = this.pwaStatusBadge.querySelector('.status-dot');
        const label = this.pwaStatusBadge.querySelector('.status-label');
        if (dot) dot.classList.add('active');
        if (label) label.textContent = 'PWA: STANDALONE';
      }
      console.log('⚡ RETROVOX running in Native Standalone PWA Mode');
    }
  }

  /**
   * Register Service Worker & handle updates
   */
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
          console.log('[PWA] Service Worker registered with scope:', registration.scope);

          // Listen for new worker installation
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.showUpdateToast(newWorker);
              }
            });
          });
        } catch (err) {
          console.warn('[PWA] Service Worker registration failed:', err);
        }
      });

      // Reload window when new service worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }

  /**
   * Show non-intrusive retro update notification toast
   */
  showUpdateToast(worker) {
    if (!this.updateToast) return;
    this.updateToast.classList.add('visible');

    if (this.updateReloadBtn) {
      this.updateReloadBtn.addEventListener('click', () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        this.updateToast.classList.remove('visible');
      });
    }
  }

  /**
   * Intercept and manage PWA install prompt
   */
  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent default mini-infobar on mobile
      e.preventDefault();
      this.deferredPrompt = e;

      // Reveal PWA Install button in header if not already standalone
      if (!this.isStandalone && this.installBtn) {
        this.installBtn.style.display = 'inline-flex';
        this.installBtn.classList.add('pulse-glow');
      }
    });

    if (this.installBtn) {
      this.installBtn.addEventListener('click', () => {
        if (this.deferredPrompt) {
          this.triggerInstall();
        } else {
          this.openPwaModal();
        }
      });
    }

    if (this.modalInstallBtn) {
      this.modalInstallBtn.addEventListener('click', () => {
        if (this.deferredPrompt) {
          this.triggerInstall();
        } else {
          alert('Die App kann über dein Browser-Menü ("App installieren" oder "Zum Startbildschirm") installiert werden.');
        }
      });
    }

    window.addEventListener('appinstalled', () => {
      console.log('⚡ RETROVOX SUB-1 was installed as PWA!');
      this.deferredPrompt = null;
      if (this.installBtn) this.installBtn.style.display = 'none';
      if (this.pwaModal) this.pwaModal.classList.remove('open');
      this.checkStandaloneMode();
    });
  }

  /**
   * Trigger native browser install prompt
   */
  async triggerInstall() {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log(`[PWA] Install prompt outcome: ${outcome}`);
    this.deferredPrompt = null;
    if (this.installBtn) {
      this.installBtn.classList.remove('pulse-glow');
      if (outcome === 'accepted') {
        this.installBtn.style.display = 'none';
      }
    }
  }

  /**
   * Network Status Watcher: Online / Offline indicator
   */
  setupNetworkStatusWatcher() {
    const updateNetworkStatus = () => {
      const isOnline = navigator.onLine;
      const statusPill = document.getElementById('networkStatusBadge');
      if (!statusPill) return;

      const dot = statusPill.querySelector('.status-dot');
      const label = statusPill.querySelector('.status-label');

      if (isOnline) {
        if (dot) {
          dot.classList.remove('offline');
          dot.classList.add('online');
        }
        if (label) label.textContent = 'NET: ONLINE';
      } else {
        if (dot) {
          dot.classList.remove('online');
          dot.classList.add('offline');
        }
        if (label) label.textContent = 'NET: OFFLINE (DSP ACTIVE)';
      }
    };

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
  }

  /**
   * Screen Wake Lock API: Prevent device sleep during live performance
   */
  setupWakeLockHandler() {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && !this.wakeLock) {
        try {
          this.wakeLock = await navigator.wakeLock.request('screen');
          this.wakeLock.addEventListener('release', () => {
            this.wakeLock = null;
          });
        } catch (err) {
          // Wake lock request failed or denied
        }
      }
    };

    // Auto-acquire wake lock on user interaction when playing
    window.addEventListener('pointerdown', requestWakeLock, { once: true });
    window.addEventListener('keydown', requestWakeLock, { once: true });

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && (this.drumEngine?.isPlaying || this.audioEngine?.isPowered)) {
        await requestWakeLock();
      }
    });
  }

  /**
   * PWA Info & Install Modal
   */
  openPwaModal() {
    if (this.pwaModal) this.pwaModal.classList.add('open');
  }

  closePwaModal() {
    if (this.pwaModal) this.pwaModal.classList.remove('open');
  }

  setupModalEvents() {
    if (this.pwaModalCloseBtn) {
      this.pwaModalCloseBtn.addEventListener('click', () => this.closePwaModal());
    }
    if (this.pwaModal) {
      this.pwaModal.addEventListener('click', (e) => {
        if (e.target === this.pwaModal) this.closePwaModal();
      });
    }
  }

  /**
   * Handle Shortcut URL Hashes (#drums, #synth)
   */
  handleShortcutsHash() {
    const hash = window.location.hash;
    if (hash === '#drums' && this.drumUI) {
      setTimeout(() => {
        if (typeof this.drumUI.openDrawer === 'function') {
          this.drumUI.openDrawer();
        } else {
          const drumBtn = document.getElementById('openDrumDrawerBtn');
          if (drumBtn) drumBtn.click();
        }
      }, 300);
    }
  }
}

// Attach to window for global access
window.PWAManager = PWAManager;
