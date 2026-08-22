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

  // Roadmap Modal Handling
  const openModal = () => roadmapModal.classList.add('open');
  const closeModal = () => roadmapModal.classList.remove('open');

  openRoadmapBtn.addEventListener('click', openModal);
  closeRoadmapBtn.addEventListener('click', closeModal);
  startExploringBtn.addEventListener('click', closeModal);

  roadmapModal.addEventListener('click', (e) => {
    if (e.target === roadmapModal) closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && roadmapModal.classList.contains('open')) {
      closeModal();
    }
  });

  console.log('⚡ RETROVOX SUB-1 Synthesizer Initialized Successfully.');
});
