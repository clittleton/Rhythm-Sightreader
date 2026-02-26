export class TimingEngine {
  constructor({ metronome }) {
    this.metronome = metronome;
    this.state = "idle";
    this.session = null;
    this.timeouts = new Set();
  }

  isTapWindowOpen() {
    return this.state === "performing";
  }

  shouldTrapSpacebar() {
    return this.state === "count-in" || this.state === "performing";
  }

  clearTimers() {
    for (const timeoutId of this.timeouts) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();
  }

  stop() {
    this.clearTimers();
    this.state = "idle";
    this.session = null;
  }

  cancel(reason = "user") {
    if (!this.session || (this.state !== "count-in" && this.state !== "performing")) {
      return false;
    }

    const snapshot = this.session.loopTapsMs.map((loopTaps) => [...loopTaps]);
    const onStateChange = this.session.onStateChange;
    const onCancel = this.session.onCancel;
    const phase = this.state;

    this.clearTimers();
    this.state = "cancelled";
    onStateChange(this.state);
    this.stop();
    onCancel({ loopTapsMs: snapshot, phase, reason });
    return true;
  }

  schedule(msFromNow, fn) {
    const timeoutId = setTimeout(() => {
      this.timeouts.delete(timeoutId);
      fn();
    }, Math.max(0, msFromNow));
    this.timeouts.add(timeoutId);
  }

  async start({
    exercise,
    loops = 1,
    latencyCompensationMs = 0,
    onStateChange = () => {},
    onBeat = () => {},
    onLoopStart = () => {},
    onTap = () => {},
    onComplete = () => {},
    onCancel = () => {},
  }) {
    this.stop();
    await this.metronome.prime();

    const beatsPerMeasure = exercise.timeSignature.num;
    const beatMs = (60000 / exercise.tempoBpm) * (4 / exercise.timeSignature.den);
    const countInMs = beatsPerMeasure * beatMs;
    const singleLoopMs = exercise.totalDurationMs;
    const performanceMs = singleLoopMs * loops;
    const totalMs = countInMs + performanceMs;
    this.session = {
      loopTapsMs: Array.from({ length: loops }, () => []),
      loops,
      singleLoopMs,
      latencyCompensationMs: Math.max(0, latencyCompensationMs),
      performanceStart: null,
      performanceEnd: null,
      totalTapCount: 0,
      onTap,
      onCancel,
      onStateChange,
    };

    this.state = "count-in";
    onStateChange(this.state);

    const totalBeatCount = Math.ceil(totalMs / beatMs);
    for (let beatIndex = 0; beatIndex <= totalBeatCount; beatIndex += 1) {
      const beatTimeMs = beatIndex * beatMs;
      this.schedule(beatTimeMs, () => {
        if (!this.session) {
          return;
        }

        const phase = beatTimeMs < countInMs ? "count-in" : "performing";
        const beatInMeasure = (beatIndex % beatsPerMeasure) + 1;
        const accent = beatInMeasure === 1;

        this.metronome.tick(accent);
        onBeat({
          phase,
          beatInMeasure,
          beatNumber: beatIndex + 1,
          loops,
        });
      });
    }

    this.schedule(countInMs, () => {
      if (!this.session) {
        return;
      }
      const actualPerformanceStart = performance.now();
      this.session.performanceStart = actualPerformanceStart;
      this.session.performanceEnd = actualPerformanceStart + performanceMs;
      this.state = "performing";
      onStateChange(this.state);
      onLoopStart(1);

      for (let loop = 2; loop <= loops; loop += 1) {
        this.schedule(singleLoopMs * (loop - 1), () => {
          if (!this.session || this.state !== "performing") {
            return;
          }
          onLoopStart(loop);
        });
      }

      this.schedule(performanceMs, () => {
        if (!this.session) {
          return;
        }
        this.state = "complete";
        onStateChange(this.state);
        onComplete({ loopTapsMs: this.session.loopTapsMs });
        this.stop();
      });
    });
  }

  registerTap(now = performance.now()) {
    if (!this.session || this.state !== "performing" || this.session.performanceStart === null) {
      return false;
    }

    if (now < this.session.performanceStart || now > this.session.performanceEnd) {
      return false;
    }

    const elapsedSincePerfStart = now - this.session.performanceStart;
    const loopIndex = Math.min(
      this.session.loops - 1,
      Math.floor(elapsedSincePerfStart / this.session.singleLoopMs),
    );
    const withinLoopMs = elapsedSincePerfStart - loopIndex * this.session.singleLoopMs;
    const compensatedTapMs = Math.round(withinLoopMs - this.session.latencyCompensationMs);
    this.session.loopTapsMs[loopIndex].push(compensatedTapMs);
    this.session.totalTapCount += 1;
    this.session.onTap({
      loop: loopIndex + 1,
      loopIndex,
      withinLoopMs: compensatedTapMs,
      tapIndexInLoop: this.session.loopTapsMs[loopIndex].length,
      totalTapCount: this.session.totalTapCount,
    });
    return true;
  }
}
