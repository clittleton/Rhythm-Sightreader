export class Metronome {
  constructor() {
    this.audioContext = null;
    this.toneSynth = null;
    this.isToneReady = false;
    this.soundMode = "click";
  }

  async prime() {
    if (typeof window === "undefined") {
      return;
    }

    if (window.Tone) {
      if (!this.toneSynth) {
        const toneContext = window.Tone.getContext?.();
        if (toneContext) {
          // Keep click playback close to real-time so grading aligns with heard pulse.
          toneContext.lookAhead = 0;
          toneContext.updateInterval = 0.01;
        }
        this.toneSynth = new window.Tone.Synth({
          oscillator: { type: "square" },
          envelope: {
            attack: 0.001,
            decay: 0.02,
            sustain: 0,
            release: 0.01,
          },
        }).toDestination();
      }
      await window.Tone.start();
      this.isToneReady = true;
      return;
    }

    if (!this.audioContext) {
      const AudioContextRef = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextRef) {
        return;
      }
      this.audioContext = new AudioContextRef({ latencyHint: "interactive" });
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  setSoundMode(mode) {
    this.soundMode = mode === "tick" ? "tick" : "click";
  }

  getEstimatedLatencyMs() {
    const clamp = (value) => Math.max(0, Math.min(250, value));

    if (this.isToneReady && window.Tone?.getContext) {
      const toneContext = window.Tone.getContext();
      const raw = toneContext?.rawContext;
      if (raw) {
        const seconds = (raw.baseLatency || 0) + (raw.outputLatency || 0);
        return clamp(Math.round(seconds * 1000));
      }
    }

    if (this.audioContext) {
      const seconds = (this.audioContext.baseLatency || 0) + (this.audioContext.outputLatency || 0);
      return clamp(Math.round(seconds * 1000));
    }

    return 0;
  }

  getTapAudioContext() {
    const toneRaw = window.Tone?.getContext?.()?.rawContext;
    if (toneRaw) {
      return toneRaw;
    }
    return this.audioContext;
  }

  triggerToneToneJs(note, durationSeconds = 0.02) {
    if (!this.isToneReady || !this.toneSynth) {
      return false;
    }

    const immediateTime =
      typeof window.Tone?.immediate === "function"
        ? window.Tone.immediate()
        : undefined;
    this.toneSynth.triggerAttackRelease(note, durationSeconds, immediateTime);
    return true;
  }

  triggerToneWebAudio({ frequency, accent = false, durationSeconds = 0.018, context = this.audioContext }) {
    if (!context) {
      return false;
    }

    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = this.soundMode === "tick" ? "sine" : "square";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.18 : 0.12, now + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + durationSeconds + 0.003);
    return true;
  }

  tapFeedback() {
    const context = this.getTapAudioContext();
    const freq = this.soundMode === "tick" ? 1480 : 1760;
    this.triggerToneWebAudio({
      frequency: freq,
      accent: false,
      durationSeconds: 0.01,
      context,
    });
  }

  tick(accent = false) {
    const note =
      this.soundMode === "tick" ? (accent ? "G6" : "D6") : accent ? "F6" : "C6";
    if (this.triggerToneToneJs(note, 0.02)) {
      return;
    }

    const freq =
      this.soundMode === "tick" ? (accent ? 1960 : 1480) : accent ? 1760 : 1320;
    this.triggerToneWebAudio({
      frequency: freq,
      accent,
      durationSeconds: 0.015,
    });
  }
}
