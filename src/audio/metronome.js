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
      this.audioContext = new AudioContextRef();
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

  tick(accent = false) {
    if (this.isToneReady && this.toneSynth) {
      const note =
        this.soundMode === "tick" ? (accent ? "G6" : "D6") : accent ? "F6" : "C6";
      const immediateTime =
        typeof window.Tone?.immediate === "function"
          ? window.Tone.immediate()
          : undefined;
      this.toneSynth.triggerAttackRelease(note, 0.02, immediateTime);
      return;
    }

    if (!this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = this.soundMode === "tick" ? "sine" : "square";
    osc.frequency.value =
      this.soundMode === "tick" ? (accent ? 1960 : 1480) : accent ? 1760 : 1320;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.18 : 0.12, now + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.018);
  }
}
