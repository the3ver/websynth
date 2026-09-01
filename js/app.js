/**
 * RETROVOX SUB-1 • MAIN APPLICATION ENTRY POINT
 */

document.addEventListener('DOMContentLoaded', () => {
  const AudioEngine = window.AudioEngine;
  const ArpEngine = window.ArpEngine;
  const SynthUI = window.SynthUI;
  const DrumEngine = window.DrumEngine;
  const DrumUI = window.DrumUI;
  const PWAManager = window.PWAManager;

  // Initialize Core Engines
  const audioEngine = new AudioEngine();
  const arpEngine = new ArpEngine(audioEngine);
  const synthUI = new SynthUI(audioEngine, arpEngine);
  const drumEngine = new DrumEngine(audioEngine);
  const drumUI = new DrumUI(drumEngine, arpEngine, audioEngine);
  const pwaManager = new PWAManager(audioEngine, drumEngine, drumUI);

  // Top Bar UI Elements
  const mainPowerBtn = document.getElementById('mainPowerBtn');
  const masterVolumeInput = document.getElementById('masterVolume');
  const masterVolumeDisplay = document.getElementById('masterVolumeDisplay');
  const audioStatusBadge = document.getElementById('audioStatusBadge');
  const midiStatusBadge = document.getElementById('midiStatusBadge');
  const midiLabel = document.getElementById('midiLabel');
  
  // Speaker LEDs
  const speakerLedLeft = document.getElementById('speakerLedLeft');
  const speakerLedRight = document.getElementById('speakerLedRight');

  // Version & Changelog State
  const CURRENT_APP_VERSION = '1.7.7';
  const STORAGE_KEY_VERSION = 'retrovox_synth_version';

  // Changelog Modal Elements
  const openChangelogBtn = document.getElementById('openChangelogBtn');
  const closeChangelogBtn = document.getElementById('closeChangelogBtn');
  const startWithNewVersionBtn = document.getElementById('startWithNewVersionBtn');
  const dontShowChangelogCheck = document.getElementById('dontShowChangelogCheck');
  const changelogModal = document.getElementById('changelogModal');

  // Master Volume Slider
  masterVolumeInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    masterVolumeDisplay.textContent = `${Math.round(val * 100)}%`;
    audioEngine.setMasterVolume(val);
  });
  masterVolumeInput.addEventListener('change', (e) => {
    e.target.blur();
  });
  masterVolumeInput.addEventListener('pointerup', (e) => {
    e.target.blur();
  });

  // Power Switch Toggle
  let isPowered = true;
  mainPowerBtn.classList.add('active');

  mainPowerBtn.addEventListener('click', () => {
    isPowered = !isPowered;
    audioEngine.setPower(isPowered);
    
    if (isPowered) {
      mainPowerBtn.classList.add('active');
      speakerLedLeft.classList.add('active');
      speakerLedRight.classList.add('active');
      audioStatusBadge.querySelector('.status-label').textContent = 'AUDIO ENGINE: RUNNING';
    } else {
      mainPowerBtn.classList.remove('active');
      speakerLedLeft.classList.remove('active');
      speakerLedRight.classList.remove('active');
      audioStatusBadge.querySelector('.status-label').textContent = 'AUDIO ENGINE: OFF';
      drumEngine.stop();
    }
  });

  // Hard Refresh / Reload Button
  const hardRefreshBtn = document.getElementById('hardRefreshBtn');
  if (hardRefreshBtn) {
    hardRefreshBtn.addEventListener('click', async () => {
      hardRefreshBtn.classList.add('loading');
      hardRefreshBtn.disabled = true;
      if (hardRefreshBtn.querySelector('.btn-icon')) {
        hardRefreshBtn.querySelector('.btn-icon').style.display = 'inline-block';
        hardRefreshBtn.querySelector('.btn-icon').style.animation = 'spin 0.6s linear infinite';
      }
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.update();
          }
        }
      } catch (err) {
        console.warn('Service worker update check on reload:', err);
      }
      window.location.reload();
    });
  }

  // AudioContext auto-unlock listener for Mobile/iPadOS Safari & Desktop
  const unlockEvents = ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'click', 'keydown'];
  const handleUserInteractionUnlock = () => {
    if (audioEngine.isPowered) {
      audioEngine.ensureAudioRunning();
      if (audioEngine.ctx && audioEngine.ctx.state === 'running') {
        audioStatusBadge.querySelector('.status-label').textContent = 'AUDIO ENGINE: RUNNING';
        removeUnlockListeners();
      }
    }
  };

  const removeUnlockListeners = () => {
    unlockEvents.forEach((evt) => {
      window.removeEventListener(evt, handleUserInteractionUnlock, { capture: true });
    });
  };

  unlockEvents.forEach((evt) => {
    window.addEventListener(evt, handleUserInteractionUnlock, { capture: true, passive: true });
  });

  // Keep Audio State Badge 100% in sync with Web Audio Context state
  audioEngine.onAudioStateChange = (state) => {
    const statusLabel = audioStatusBadge.querySelector('.status-label');
    if (!audioEngine.isPowered) {
      statusLabel.textContent = 'AUDIO ENGINE: OFF';
      return;
    }
    if (state === 'running') {
      statusLabel.textContent = 'AUDIO ENGINE: RUNNING';
      removeUnlockListeners();
    } else if (state === 'suspended' || state === 'interrupted') {
      statusLabel.textContent = 'AUDIO ENGINE: TAP TO ACTIVATE';
    } else {
      statusLabel.textContent = `AUDIO ENGINE: ${state.toUpperCase()}`;
    }
  };

  // Direct Tap on Audio Status Badge to manually unlock or resume audio
  audioStatusBadge.style.cursor = 'pointer';
  audioStatusBadge.addEventListener('click', () => {
    if (audioEngine.isPowered) {
      audioEngine.resumeAudio();
    }
  });

  // Re-resume audio when returning from background / tab switch on iOS / iPadOS
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioEngine.isPowered) {
      audioEngine.ensureAudioRunning();
    }
  });

  // Web MIDI Status listener
  audioEngine.onMidiStateChange = (hasDevices, count) => {
    const dot = midiStatusBadge.querySelector('.status-dot');
    if (hasDevices) {
      dot.classList.add('active');
      midiLabel.textContent = `MIDI: ${count} DEVICE${count > 1 ? 'S' : ''} CONNECTED`;
      midiStatusBadge.style.borderColor = 'rgba(0, 229, 255, 0.4)';
    } else {
      dot.classList.remove('active');
      midiLabel.textContent = 'MIDI: STANDBY';
      midiStatusBadge.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    }
  };

  // Changelog Modal Handling
  const openChangelog = () => {
    if (changelogModal) {
      changelogModal.classList.add('open');
    }
  };

  const closeChangelog = () => {
    if (changelogModal) {
      changelogModal.classList.remove('open');
      if (dontShowChangelogCheck && dontShowChangelogCheck.checked) {
        try {
          localStorage.setItem(STORAGE_KEY_VERSION, CURRENT_APP_VERSION);
        } catch (e) {}
      }
    }
  };

  if (openChangelogBtn) openChangelogBtn.addEventListener('click', openChangelog);
  if (closeChangelogBtn) closeChangelogBtn.addEventListener('click', closeChangelog);
  if (startWithNewVersionBtn) startWithNewVersionBtn.addEventListener('click', closeChangelog);

  if (changelogModal) {
    changelogModal.addEventListener('click', (e) => {
      if (e.target === changelogModal) closeChangelog();
    });
  }

  // Automatic Version Detection on Page Load
  try {
    const lastSeenVersion = localStorage.getItem(STORAGE_KEY_VERSION);
    if (lastSeenVersion !== CURRENT_APP_VERSION && !window.location.hash) {
      // Show "What's New" modal with a smooth slight delay
      setTimeout(() => {
        openChangelog();
      }, 450);
    }
  } catch (e) {}

  // Global Escape Key Listener for Modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (changelogModal && changelogModal.classList.contains('open')) {
        closeChangelog();
      }
      const pwaModal = document.getElementById('pwaModal');
      if (pwaModal && pwaModal.classList.contains('open')) {
        pwaModal.classList.remove('open');
      }
    }
  });

  console.log(`⚡ RETROVOX SUB-1 Synthesizer v${CURRENT_APP_VERSION} Initialized Successfully.`);
});
