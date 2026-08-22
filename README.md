# ⚡ RETROVOX SUB-1 • Analog Web Synthesizer

[![Version](https://img.shields.io/badge/Version-1.2.0-00E5FF?style=flat-square)](#)
[![Web Audio API](https://img.shields.io/badge/Web_Audio_API-DSP_Engine-00E5FF?style=flat-square&logo=w3c&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Web MIDI API](https://img.shields.io/badge/Web_MIDI_API-Supported-FF3366?style=flat-square&logo=midi&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript_%26_CSS-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> **RETROVOX SUB-1** ist ein vollwertiger, subtraktiver analoger Synthesizer und 16-Step Sequenzer direkt im Webbrowser. Entwickelt mit nativer **Web Audio API**, **Web MIDI API** und **Vanilla JavaScript/CSS** – kompromisslose Performance ohne externe Frameworks oder Build-Schritte.

---

## 🌟 Features & Highlights

### 🛡️ DSP Audio Engine & Voice Architecture (v1.2.0)
- **12-Stimmen Voice-Pooling (Zero GC Churn)**: Fester Pool aus 12 persistent verdrahteten Stimmen eliminiert Garbage-Collection-Ruckler und AudioNode-Allokationen während des Spielens vollständig.
- **LRU Voice Stealing**: Bei Auslastung aller 12 Stimmen wird die am längsten klingende Stimme mit einem 2ms-Anti-Click-Fadeout nahtlos übernommen.
- **Master Brickwall Limiter & Anti-Clipping**: Dedizierter Peak-Limiter fängt Pegelspitzen bei 0 dBFS zuverlässig ab.
- **Envelope De-Clicking**: Mathematisch kalibrierte Mindest-Attackzeit und asymptotisches Voice-Release verhindern jegliche Abreiß-Knackser.
- **Normalisierter Tanh Filter-Drive**: Hyperbeltangens-Sättigungskurve für stufenlose analoge Bandsättigung ohne Pegelsprünge ($y = \tanh(G \cdot x)/\tanh(G)$).

### 🎛️ Subtraktive Synthese & Modulation
- **Duale Oszillatoren (VCO 1 & VCO 2)**: Sägezahn, Rechteck (mit PWM), Dreieck, Sinus, Hard-Sync, Detune (Cents/Halbtöne) und Oktavwahlschalter.
- **Sub-Oszillator & Rauschen**: Wählbare Sub-Oktave (-1 oder -2 Oktaven) und kontinuierlich mischbares Weißes Rauschen.
- **24dB Resonantes Ladder-Filter (VCF)**: Tiefpass (24dB & 12dB), Bandpass und Hochpass mit kaskadierter Resonanz-Kompensation, Hüllkurven-Modulation und Keyboard Tracking.
- **Duale ADSR-Hüllkurven**: Getrennte, ultraschnelle Kurven für Filter (VCF) und Lautstärke (VCA).
- **Duales LFO Modulationsnetzwerk**: 2 unabhängige LFOs mit Multi-Wellenformen, echter **Sample & Hold**-Schaltung, Delay/Fade-In und flexiblem Routing auf Pitch, VCF, PWM und Amp.

### ⏱️ Präzisions-Sequenzer & Studio FX
- **Web Worker Precision Clock**: Jitterfreier Arpeggiator-Taktgeber läuft in einem separaten Web Worker Hintergrund-Thread – felsenfestes Timing unabhängig von UI-Rendern oder Tab-Hintergrundbetrieb.
- **16-Step Arpeggiator & Pattern Sequenzer**: Modi: *Up*, *Down*, *Up/Down*, *Random*, *As Played* mit Gate-Steuerung, Latch/Hold und Oktav-Range.
- **Vintage Stereo FX Rack**:
  - **Roland Juno-Style BBD Stereo Chorus** (Modi: *Off*, *I*, *II*, *I+II*)
  - **Stereo Tape Delay / Echo** mit BPM-Sync, Spatial Stereo-Spread und High-Cut Dämpfung
  - **Studio Space Reverb** mit stufenlosem Raum-Decay und Mix

### 🔊 Studio-Visuals & Konnektivität
- **Interaktive KRK-X5 Nahfeldmonitore**: Realistische Bassmembran-Auslenkung in Echtzeit.
- **CRT-Oszilloskop**: Echtzeit-Wellenformanalyse mit intelligentem **Idle-Pausing** zur CPU-Entlastung bei Stille.
- **Web MIDI API**: Automatische Erkennung von Hardware-MIDI-Keyboards inkl. Pitch-Bend, Mod-Wheel, Velocity und Sustain-Pedal.
- **Preset-Verwaltung**: 10 handgefertigte Werks-Presets, lokale Speicherfunktion für eigene User-Presets und JSON Export/Import.
- **"Was gibt's Neues?" Release-Screen**: Integriertes Versions-Update-Modal mit Changelog-Archiv.

---

## 🎧 Sound-Architektur

```mermaid
graph LR
    subgraph Oscillators["OSZILLATOREN & MIXER"]
        VCO1["VCO 1 (Saw/Square/Tri/Sin + PWM)"]
        VCO2["VCO 2 (Sync + Detune + Pitch)"]
        SUB["Sub-Oszillator (-1 / -2 Oct)"]
        NOISE["Noise Generator (White Noise)"]
        MIX["Voice Mixer Bus"]
        VCO1 --> MIX
        VCO2 --> MIX
        SUB --> MIX
        NOISE --> MIX
    end

    subgraph Modulation["MODULATION"]
        LFO1["LFO 1 (Multi-Wave / Fade-In)"]
        LFO2["LFO 2 (Multi-Wave / S&H)"]
        ENV_F["Filter Envelope (ADSR)"]
        ENV_A["Amp Envelope (ADSR)"]
    end

    subgraph FilterAmp["12-VOICE POOL (ZERO GC)"]
        SHAPER["Tanh Drive Saturation"]
        VCF["24dB Moog Ladder VCF (Q-Staged)"]
        VCA["VCA Stage"]
        MIX --> SHAPER
        SHAPER --> VCF
        VCF --> VCA
        LFO1 -.-> VCF
        LFO2 -.-> VCO1
        ENV_F -.-> VCF
        ENV_A -.-> VCA
    end

    subgraph FX["STEREO FX RACK"]
        CHORUS["Juno Stereo Chorus (I / II / I+II)"]
        DELAY["Stereo Tape Echo (Ping-Pong + Damp)"]
        REVERB["Studio Space Reverb"]
        VCA --> CHORUS
        CHORUS --> DELAY
        DELAY --> REVERB
    end

    subgraph Output["MASTER & VISUALS"]
        LIMITER["DSP Brickwall Peak Limiter"]
        ANALYSER["Oscilloscope & FFT Analyser"]
        VU["Dual LED VU Meters"]
        SPEAKERS["KRK-X5 Dynamic Monitors"]
        REVERB --> LIMITER
        LIMITER --> ANALYSER
        ANALYSER --> VU
        ANALYSER --> SPEAKERS
    end
```

---

## 🚀 Schnellstart

Das Projekt benötigt **keinen Build-Prozess** und hat **keine externen Abhängigkeiten**.

### Option 1: Direkt im Browser öffnen
Einfach die Datei `index.html` per Doppelklick in einem modernen Webbrowser (Chrome, Edge, Firefox, Brave, Safari) öffnen.

### Option 2: Mit lokalem Webserver
```bash
# Repository klonen
git clone https://github.com/the3ver/websynth.git
cd websynth

# Lokalen Webserver starten
npx serve .
# oder mit Python: python -m http.server 8000
```
Öffne anschließend [http://localhost:3000](http://localhost:3000) (oder den im Terminal angezeigten Port).

---

## 🎹 Tastatur-Steuerung (Computer Keyboard)

Du kannst den Synthesizer direkt über deine Computertastatur spielen:

| Taste | Note | Taste | Note |
| :--- | :--- | :--- | :--- |
| <kbd>A</kbd> | C3 | <kbd>W</kbd> | C#3 |
| <kbd>S</kbd> | D3 | <kbd>E</kbd> | D#3 |
| <kbd>D</kbd> | E3 | <kbd>T</kbd> | F#3 |
| <kbd>F</kbd> | F3 | <kbd>Z</kbd> / <kbd>Y</kbd> | G#3 |
| <kbd>G</kbd> | G3 | <kbd>U</kbd> | A#3 |
| <kbd>H</kbd> | A3 | <kbd>O</kbd> | C#4 |
| <kbd>J</kbd> | B3 | <kbd>P</kbd> | D#4 |
| <kbd>K</kbd> | C4 | <kbd>Ö</kbd> | D4 |

- **Oktaven umschalten**: <kbd>X</kbd> (Oktave höher), <kbd>Z</kbd> (Oktave tiefer)
- **Sustain / Latch**: Halte Noten mit der Maus oder aktiviere den Arpeggiator-Latch.

---

## 🔌 Hardware Web MIDI Setup

1. Schließe dein USB- oder Bluetooth-MIDI-Keyboard an deinen Computer an.
2. Öffne den **RETROVOX SUB-1** im Browser.
3. Die MIDI-Statusanzeige in der oberen Leiste wechselt automatisch auf `MIDI: 1 DEVICE CONNECTED`.
4. Unterstützte MIDI-Befehle:
   - `Note On` / `Note Off` (mit Velocity-Dynamik)
   - `Pitch Bend` (Wheel / Lever)
   - `Control Change #1` (Modulation Wheel)
   - `Control Change #64` (Sustain Pedal)
   - `All Notes Off` / `Panic`

---

## 💾 Factory Presets

| Nr. | Preset-Name | Kategorie | Beschreibung |
| :--- | :--- | :--- | :--- |
| **01** | `BLADE RUNNER BRASS` | Brass | Epische Vangelis CS-80 Brass mit Filter-Sweep, Juno-Chorus und Space Reverb. |
| **02** | `MOOG MINIMOOG BASS` | Bass | Fetter, druckvoller Moog Ladder Bass mit 24dB Sättigung und Sub-Oktave. |
| **03** | `JUNO-106 SYNTHWAVE PLUCK` | Pluck | Klassischer 80s Roland Arp-Sound mit PWM, BBD Chorus II und Tape Echo. |
| **04** | `TB-303 ACID RESO` | Acid / Lead | Resonante Acid-Bassline mit steilem Filter-Envelope und Glide/Portamento. |
| **05** | `80s JUMP POLY BRASS` | Brass | Ikonischer Oberheim OB-Xa Style Synthesizer-Sound mit detunten Saw-Waves. |
| **06** | `CYBERPUNK DARK BASSLINE` | Bass | Aggressiver, gesättigter Darksynth-Bass mit Noise-Layer und Filter-Drive. |
| **07** | `SCI-FI SAMPLE & HOLD` | FX | Zufallsmodulierter Sample & Hold Soundeffekt aus alten Modular-Synthesizern. |
| **08** | `LUSH ETHEREAL DREAM PAD` | Pad | Schwebende, warme Ambient-Klanglandschaft mit langen Hüllkurven und Hall. |
| **09** | `STRANGER 80s SYNTH THEME` | Arp | Arpeggierter Synthwave-Klassiker mit analogem Drift und Stereo-Delay. |
| **10** | `CRYSTAL DIGITAL CHIMES` | Lead | Brillanter Glockenklang mit hoher Resonanz und subtilem Pitch-Vibrato. |

---

## 📁 Projektstruktur

```
websynth/
├── .github/
│   └── workflows/
│       └── deploy.yml      # Automatische GitHub Pages CI/CD Pipeline
├── css/
│   └── style.css           # Vollständiges High-End Analog-Studio UI & Styling
├── js/
│   ├── app.js              # Initialisierung, Master Controls & Version State
│   ├── arp-engine.js       # 16-Step Arpeggiator & Web Worker Precision Clock
│   ├── audio-engine.js     # Web Audio API Synthese-Engine (Voice-Pool, VCF, LFO, FX)
│   ├── presets.js          # Factory Preset Library & State Serializer
│   └── synth-ui.js         # Interaktives UI (Knobs, Slider, Canvas, MIDI)
├── .gitignore              # Git Ignore Konfiguration
├── AGENTS.md               # Entwickler- & Agent-Architekturleitfaden
├── index.html              # Synthesizer Studio HTML5 Markup
├── LICENSE                 # MIT Lizenz
├── package.json            # Projekt-Metadaten & Hilfsskripte
└── README.md               # Dokumentation
```

---

## 🛠️ Technologien

- **Web Audio API** (`AudioContext`, `OscillatorNode`, `BiquadFilterNode`, `GainNode`, `WaveShaperNode`, `DelayNode`, `ConvolverNode`, `AnalyserNode`, `DynamicsCompressorNode`)
- **Web Workers** (Inline Worker via Blob URL für hochpräzise Sequenzer-Clock)
- **Web MIDI API** (`navigator.requestMIDIAccess`)
- **Vanilla JavaScript (ES6+)**
- **Modern CSS3** (Custom Properties, Flexbox, Grid, Glassmorphism, CSS Transitions & Keyframes)
- **Google Fonts** (*Chakra Petch*, *Inter*, *JetBrains Mono*)

---

## 📄 Lizenz

Dieses Projekt ist unter der **[MIT Lizenz](LICENSE)** lizenziert – freie Nutzung für private und kommerzielle Zwecke.
