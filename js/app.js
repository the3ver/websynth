/**
 * RETROVOX SUB-1 • MAIN APPLICATION ENTRY POINT
 */

document.addEventListener('DOMContentLoaded', () => {
  const AudioEngine = window.AudioEngine;
  const ArpEngine = window.ArpEngine;
  const SynthUI = window.SynthUI;

  // Initialize Core Engines
  const audioEngine = new AudioEngine();
  const arpEngine = new ArpEngine(audioEngine);
  const synthUI = new SynthUI(audioEngine, arpEngine);

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
  const CURRENT_APP_VERSION = '1.1.0';
  const STORAGE_KEY_VERSION = 'retrovox_synth_version';

  // Changelog Modal Elements
  const openChangelogBtn = document.getElementById('openChangelogBtn');
  const closeChangelogBtn = document.getElementById('closeChangelogBtn');
  const startWithNewVersionBtn = document.getElementById('startWithNewVersionBtn');
  const viewRoadmapFromChangelogBtn = document.getElementById('viewRoadmapFromChangelogBtn');
  const dontShowChangelogCheck = document.getElementById('dontShowChangelogCheck');
  const changelogModal = document.getElementById('changelogModal');

  // Roadmap Modal Elements
  const openRoadmapBtn = document.getElementById('openRoadmapBtn');
  const closeRoadmapBtn = document.getElementById('closeRoadmapBtn');
  const startExploringBtn = document.getElementById('startExploringBtn');
  const roadmapModal = document.getElementById('roadmapModal');

  // Master Volume Slider
  masterVolumeInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    masterVolumeDisplay.textContent = `${Math.round(val * 100)}%`;
    audioEngine.setMasterVolume(val);
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
    }
  });

  // AudioContext auto-unlock listener on first user interaction anywhere
  const unlockAudio = () => {
    if (audioEngine.isPowered) {
      const state = audioEngine.initAudio();
      if (state === 'running') {
        audioStatusBadge.querySelector('.status-label').textContent = 'AUDIO ENGINE: RUNNING';
      }
    }
  };

  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, capture: true });
  window.addEventListener('mousedown', unlockAudio, { once: true, capture: true });
  window.addEventListener('keydown', unlockAudio, { once: true, capture: true });

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

  if (viewRoadmapFromChangelogBtn) {
    viewRoadmapFromChangelogBtn.addEventListener('click', () => {
      closeChangelog();
      openRoadmap();
    });
  }

  if (changelogModal) {
    changelogModal.addEventListener('click', (e) => {
      if (e.target === changelogModal) closeChangelog();
    });
  }

  // Automatic Version Detection on Page Load
  try {
    const lastSeenVersion = localStorage.getItem(STORAGE_KEY_VERSION);
    if (lastSeenVersion !== CURRENT_APP_VERSION) {
      // Show "What's New" modal with a smooth slight delay
      setTimeout(() => {
        openChangelog();
      }, 450);
    }
  } catch (e) {}

  // Roadmap Modal Handling
  const openRoadmap = () => {
    if (roadmapModal) roadmapModal.classList.add('open');
  };
  const closeRoadmap = () => {
    if (roadmapModal) roadmapModal.classList.remove('open');
  };

  if (openRoadmapBtn) openRoadmapBtn.addEventListener('click', openRoadmap);
  if (closeRoadmapBtn) closeRoadmapBtn.addEventListener('click', closeRoadmap);
  if (startExploringBtn) startExploringBtn.addEventListener('click', closeRoadmap);

  if (roadmapModal) {
    roadmapModal.addEventListener('click', (e) => {
      if (e.target === roadmapModal) closeRoadmap();
    });
  }

  // Global Escape Key Listener for Modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (changelogModal && changelogModal.classList.contains('open')) {
        closeChangelog();
      } else if (roadmapModal && roadmapModal.classList.contains('open')) {
        closeRoadmap();
      }
    }
  });

  console.log(`⚡ RETROVOX SUB-1 Synthesizer v${CURRENT_APP_VERSION} Initialized Successfully.`);
});
