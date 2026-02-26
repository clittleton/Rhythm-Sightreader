import { Metronome } from "./audio/metronome.js";
import { getLevelConfig, listLevelIds } from "./config/levels.js";
import { gradeAttempt, gradeChallenge } from "./core/grader.js";
import { buildExpectedOnsetsMs, generateExercise, getExerciseDurationMs } from "./core/rhythmGenerator.js";
import { TimingEngine } from "./core/timingEngine.js";
import { clearFeedback, renderAttemptTable, renderLoopBreakdown, renderSummaryCards } from "./ui/feedbackView.js";
import { renderNotation } from "./ui/notationView.js";

const ui = {
  levelSelect: document.getElementById("levelSelect"),
  generateBtn: document.getElementById("generateBtn"),
  startBtn: document.getElementById("startBtn"),
  loopBtn: document.getElementById("loopBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  tempoSlider: document.getElementById("tempoSlider"),
  tempoInput: document.getElementById("tempoInput"),
  clickSoundSelect: document.getElementById("clickSoundSelect"),
  timeSignatureValue: document.getElementById("timeSignatureValue"),
  tempoValue: document.getElementById("tempoValue"),
  statusValue: document.getElementById("statusValue"),
  beatIndicator: document.getElementById("beatIndicator"),
  beatText: document.getElementById("beatText"),
  notationContainer: document.getElementById("notationContainer"),
  tapStatus: document.getElementById("tapStatus"),
  summaryCards: document.getElementById("summaryCards"),
  loopBreakdown: document.getElementById("loopBreakdown"),
  feedbackTableBody: document.getElementById("feedbackTableBody"),
  timelineStrip: document.getElementById("timelineStrip"),
  liveTimingFeedback: document.getElementById("liveTimingFeedback"),
  liveTimingText: document.getElementById("liveTimingText"),
};

const metronome = new Metronome();
const timingEngine = new TimingEngine({ metronome });

const appState = {
  exercise: null,
  loopTapSets: [],
  loopResults: [],
  selectedTempoBpm: null,
  isSessionActive: false,
  isSpaceHeld: false,
};

function clampTempo(value) {
  return Math.max(40, Math.min(220, Number(value) || 90));
}

function syncTempoControls(bpm) {
  const clamped = clampTempo(bpm);
  ui.tempoSlider.value = String(clamped);
  ui.tempoInput.value = String(clamped);
  ui.tempoValue.textContent = String(clamped);
}

function setStatus(text) {
  ui.statusValue.textContent = text;
}

function setTapStatus(text) {
  ui.tapStatus.textContent = text;
}

function setButtonsDisabled(disabled) {
  ui.generateBtn.disabled = disabled;
  ui.startBtn.disabled = disabled;
  ui.loopBtn.disabled = disabled;
  ui.levelSelect.disabled = disabled;
  ui.cancelBtn.disabled = !disabled;
}

function setBeatIndicator(active, label) {
  ui.beatIndicator.classList.toggle("active", active);
  ui.beatText.textContent = label;
}

function timingClassFromOffset(offsetMs) {
  const abs = Math.abs(offsetMs);
  if (abs <= 50) {
    return "timing-good";
  }
  if (abs <= 100) {
    return "timing-warn";
  }
  return "timing-bad";
}

function timingWordsFromOffset(offsetMs) {
  const rounded = Math.round(offsetMs);
  if (rounded < 0) {
    return `Early ${Math.abs(rounded)} ms`;
  }
  if (rounded > 0) {
    return `Late ${rounded} ms`;
  }
  return "On time";
}

function resetLiveTimingFeedback(message = "Waiting for first tap") {
  if (!ui.liveTimingFeedback || !ui.liveTimingText) {
    return;
  }
  ui.liveTimingFeedback.classList.remove("timing-good", "timing-warn", "timing-bad", "timing-extra");
  ui.liveTimingText.textContent = message;
}

function setLiveTimingFeedback({ offsetMs, isExtra = false }) {
  if (!ui.liveTimingFeedback || !ui.liveTimingText) {
    return;
  }
  ui.liveTimingFeedback.classList.remove("timing-good", "timing-warn", "timing-bad", "timing-extra");
  ui.liveTimingFeedback.classList.add(timingClassFromOffset(offsetMs));
  if (isExtra) {
    ui.liveTimingFeedback.classList.add("timing-extra");
  }
  const timingText = timingWordsFromOffset(offsetMs);
  ui.liveTimingText.textContent = isExtra ? `Extra tap: ${timingText}` : timingText;
}

function findNearestExpectedOffset(expectedOnsetsMs, tapMs) {
  if (!expectedOnsetsMs.length) {
    return { expectedIndex: -1, offsetMs: 0 };
  }

  let low = 0;
  let high = expectedOnsetsMs.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (expectedOnsetsMs[mid] < tapMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const leftIndex = Math.max(0, low - 1);
  const rightIndex = Math.min(expectedOnsetsMs.length - 1, low);
  const leftGap = Math.abs(tapMs - expectedOnsetsMs[leftIndex]);
  const rightGap = Math.abs(tapMs - expectedOnsetsMs[rightIndex]);
  const expectedIndex = rightGap < leftGap ? rightIndex : leftIndex;
  return {
    expectedIndex,
    offsetMs: Math.round(tapMs - expectedOnsetsMs[expectedIndex]),
  };
}

function getMissCheckDelayMs(expectedOnsetsMs, expectedIndex) {
  const expectedMs = expectedOnsetsMs[expectedIndex];
  const nextMs = expectedOnsetsMs[expectedIndex + 1];
  if (typeof nextMs === "number") {
    const gapMs = Math.max(1, nextMs - expectedMs);
    return Math.max(120, Math.min(320, Math.round(gapMs * 0.72)));
  }
  return 240;
}

function buildNotationAnalysisRow(label, expectedOnsetsMs, tapsMs, result) {
  const expectedByTapIndex = new Map();
  result.matchedTapIndices.forEach((tapIndex, expectedIndex) => {
    if (tapIndex >= 0) {
      expectedByTapIndex.set(tapIndex, expectedIndex);
    }
  });

  const tapEvents = tapsMs.map((tapMs, tapIndex) => {
    const expectedIndex = expectedByTapIndex.get(tapIndex);
    if (expectedIndex !== undefined) {
      return {
        tapMs,
        offsetMs: Math.round(tapMs - expectedOnsetsMs[expectedIndex]),
        isExtra: false,
      };
    }
    const nearest = findNearestExpectedOffset(expectedOnsetsMs, tapMs);
    return {
      tapMs,
      offsetMs: nearest.offsetMs,
      isExtra: true,
    };
  });

  const missedExpectedIndices = result.matchedTapIndices.reduce((indices, tapIndex, expectedIndex) => {
    if (tapIndex === -1) {
      indices.push(expectedIndex);
    }
    return indices;
  }, []);

  return {
    label,
    tapEvents,
    missedExpectedIndices,
  };
}

function populateLevelSelector() {
  const levels = listLevelIds();
  levels.forEach((levelId) => {
    const option = document.createElement("option");
    option.value = String(levelId);
    option.textContent = `Level ${levelId}`;
    ui.levelSelect.append(option);
  });
  ui.levelSelect.value = "1";
}

function currentLevelConfig() {
  return getLevelConfig(Number(ui.levelSelect.value));
}

function resetResults() {
  appState.loopTapSets = [];
  appState.loopResults = [];
  clearFeedback({
    summaryCardsEl: ui.summaryCards,
    tableBodyEl: ui.feedbackTableBody,
    timelineEl: ui.timelineStrip,
    loopBreakdownEl: ui.loopBreakdown,
  });
}

function renderCurrentExercise() {
  const exercise = appState.exercise;
  if (!exercise) {
    return;
  }

  ui.timeSignatureValue.textContent = `${exercise.timeSignature.num}/${exercise.timeSignature.den}`;
  syncTempoControls(exercise.tempoBpm);
  renderNotation(ui.notationContainer, exercise, []);
}

function applyTempoToExercise(tempoBpm, source) {
  const tempo = clampTempo(tempoBpm);
  appState.selectedTempoBpm = tempo;
  syncTempoControls(tempo);

  if (!appState.exercise) {
    return;
  }

  appState.exercise.tempoBpm = tempo;
  appState.exercise.expectedOnsetsMs = buildExpectedOnsetsMs(appState.exercise.notes, tempo);
  appState.exercise.totalDurationMs = getExerciseDurationMs(appState.exercise.notes, tempo);
  setTapStatus(`Expected notes to hit: ${appState.exercise.expectedOnsetsMs.length}`);

  if (timingEngine.shouldTrapSpacebar() && source === "user") {
    setStatus("Tempo changed");
    setTapStatus("Tempo updated for next attempt.");
  }
}

function generateNewExercise() {
  if (appState.isSessionActive) {
    return;
  }

  const levelConfig = currentLevelConfig();
  try {
    appState.exercise = generateExercise(levelConfig);
  } catch (error) {
    appState.exercise = null;
    resetResults();
    renderNotation(ui.notationContainer, null, []);
    setStatus("Error");
    setBeatIndicator(false, "Error");
    setTapStatus(`Generation failed: ${error.message}`);
    resetLiveTimingFeedback("No exercise loaded");
    return;
  }

  if (appState.selectedTempoBpm !== null) {
    applyTempoToExercise(appState.selectedTempoBpm, "system");
  } else {
    appState.selectedTempoBpm = appState.exercise.tempoBpm;
  }
  renderCurrentExercise();
  resetResults();
  setStatus("Ready");
  setBeatIndicator(false, "Ready");
  setTapStatus(`Expected notes to hit: ${appState.exercise.expectedOnsetsMs.length}`);
  resetLiveTimingFeedback();
}

function showLoopDetail(loopIndex) {
  if (!appState.loopResults.length) {
    return;
  }

  const safeIndex = Math.max(0, Math.min(appState.loopResults.length - 1, loopIndex));
  const result = appState.loopResults[safeIndex];
  const tapsMs = appState.loopTapSets[safeIndex];

  renderAttemptTable(ui.feedbackTableBody, appState.exercise.expectedOnsetsMs, tapsMs, result);
  ui.timelineStrip.innerHTML = "";
  setTapStatus(`Showing loop ${safeIndex + 1} detail. Taps: ${tapsMs.length}`);
}

function addLoopButtons(loopCount) {
  for (let idx = 0; idx < loopCount; idx += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "loop-pill";
    button.textContent = `Show loop ${idx + 1} detail`;
    button.addEventListener("click", () => showLoopDetail(idx));
    ui.loopBreakdown.append(button);
  }
}

async function runSession(loops) {
  if (appState.isSessionActive) {
    return;
  }

  if (!appState.exercise) {
    generateNewExercise();
  }
  if (!appState.exercise) {
    return;
  }

  const sessionExercise = {
    ...appState.exercise,
    timeSignature: { ...appState.exercise.timeSignature },
    notes: appState.exercise.notes.map((note) => ({ ...note })),
    expectedOnsetsMs: [...appState.exercise.expectedOnsetsMs],
  };

  resetResults();
  const liveNoteFeedback = renderNotation(ui.notationContainer, sessionExercise, []);
  const liveHitByLoop = Array.from({ length: loops }, () => new Set());
  const missTimeouts = [];
  const clearMissTimeouts = () => {
    missTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    missTimeouts.length = 0;
  };
  const scheduleLoopMissChecks = (loopNumber) => {
    const loopIndex = loopNumber - 1;
    const hitSet = liveHitByLoop[loopIndex];
    if (!hitSet) {
      return;
    }

    sessionExercise.expectedOnsetsMs.forEach((expectedMs, expectedIndex) => {
      const delayMs = expectedMs + getMissCheckDelayMs(sessionExercise.expectedOnsetsMs, expectedIndex);
      const timeoutId = setTimeout(() => {
        if (!appState.isSessionActive || hitSet.has(expectedIndex)) {
          return;
        }
        hitSet.add(expectedIndex);
        liveNoteFeedback.flashMiss(expectedIndex);
      }, Math.max(0, delayMs));
      missTimeouts.push(timeoutId);
    });
  };

  setButtonsDisabled(true);
  appState.isSessionActive = true;
  setStatus("Starting");
  setTapStatus("Preparing audio and count-in...");
  resetLiveTimingFeedback("Waiting for count-in...");

  let totalTapCount = 0;

  try {
    const extraLeadCompensationMs = 30;
    const latencyCompensationMs = metronome.getEstimatedLatencyMs() + extraLeadCompensationMs;
    setTapStatus(
      `Preparing audio and count-in... auto latency compensation ${latencyCompensationMs} ms`,
    );

    await timingEngine.start({
      exercise: sessionExercise,
      loops,
      latencyCompensationMs,
      onStateChange: (state) => {
        if (state === "count-in") {
          setStatus("Count-in");
          setBeatIndicator(true, "Count-in...");
        } else if (state === "performing") {
          setStatus("Recording");
          setBeatIndicator(true, "Play now");
        } else if (state === "complete") {
          setStatus("Scoring");
          setBeatIndicator(false, "Scoring...");
        } else if (state === "cancelled") {
          setStatus("Cancelled");
          setBeatIndicator(false, "Cancelled");
        }
      },
      onBeat: ({ phase, beatInMeasure }) => {
        const phaseText = phase === "count-in" ? "Count-in" : "Playing";
        setBeatIndicator(true, `${phaseText}: beat ${beatInMeasure}`);
      },
      onLoopStart: (loopNumber) => {
        liveNoteFeedback.clear();
        scheduleLoopMissChecks(loopNumber);
        resetLiveTimingFeedback(`Loop ${loopNumber}: waiting for tap`);
        if (loops > 1) {
          setTapStatus(`Loop ${loopNumber}/${loops} active. Press Space on each note.`);
        } else {
          setTapStatus("Attempt active. Press Space on each note.");
        }
      },
      onTap: ({ loop, withinLoopMs, totalTapCount: sessionTapCount }) => {
        totalTapCount = sessionTapCount;
        const nearest = findNearestExpectedOffset(sessionExercise.expectedOnsetsMs, withinLoopMs);
        if (nearest.expectedIndex >= 0 && liveHitByLoop[loop - 1]) {
          liveHitByLoop[loop - 1].add(nearest.expectedIndex);
        }
        liveNoteFeedback.flashTap(withinLoopMs, nearest.offsetMs);
        setLiveTimingFeedback({ offsetMs: nearest.offsetMs });
        setTapStatus(
          `Loop ${loop}/${loops} active. Total taps: ${totalTapCount}. ${timingWordsFromOffset(nearest.offsetMs)}.`,
        );
      },
      onComplete: ({ loopTapsMs }) => {
        clearMissTimeouts();
        appState.loopTapSets = loopTapsMs;
        appState.isSessionActive = false;
        setButtonsDisabled(false);
        setBeatIndicator(false, "Finished");
        resetLiveTimingFeedback("Session complete");

        if (loops === 1) {
          const result = gradeAttempt(sessionExercise.expectedOnsetsMs, loopTapsMs[0]);
          appState.loopResults = [result];
          renderSummaryCards(ui.summaryCards, result, "Attempt");
          renderNotation(ui.notationContainer, sessionExercise, [
            buildNotationAnalysisRow("Attempt", sessionExercise.expectedOnsetsMs, loopTapsMs[0], result),
          ]);
          renderAttemptTable(ui.feedbackTableBody, sessionExercise.expectedOnsetsMs, loopTapsMs[0], result);
          ui.timelineStrip.innerHTML = "";
          setTapStatus(`Completed. Recorded ${loopTapsMs[0].length} taps.`);
          setStatus("Ready");
          return;
        }

        const challenge = gradeChallenge(sessionExercise.expectedOnsetsMs, loopTapsMs);
        appState.loopResults = challenge.loopResults;
        renderNotation(
          ui.notationContainer,
          sessionExercise,
          challenge.loopResults.map((loopResult, loopIndex) =>
            buildNotationAnalysisRow(
              `Loop ${loopIndex + 1}`,
              sessionExercise.expectedOnsetsMs,
              loopTapsMs[loopIndex],
              loopResult,
            ),
          ),
        );

        renderSummaryCards(
          ui.summaryCards,
          {
            overallAccuracy: challenge.averageScore,
            timingLabel: "mixed",
            missedCount: challenge.loopResults.reduce((sum, item) => sum + item.missedCount, 0),
            extraTapCount: challenge.loopResults.reduce((sum, item) => sum + item.extraTapCount, 0),
          },
          "Challenge Avg",
        );

        renderLoopBreakdown(ui.loopBreakdown, challenge.loopResults, challenge.averageScore);
        addLoopButtons(challenge.loopResults.length);
        showLoopDetail(0);
        setStatus("Ready");
      },
      onCancel: ({ loopTapsMs }) => {
        clearMissTimeouts();
        appState.loopTapSets = loopTapsMs;
        appState.isSessionActive = false;
        setButtonsDisabled(false);
        setBeatIndicator(false, "Cancelled");
        setStatus("Cancelled");
        resetLiveTimingFeedback("Session cancelled");
        const recordedTaps = loopTapsMs.reduce((sum, taps) => sum + taps.length, 0);
        setTapStatus(`Cancelled. Recorded ${recordedTaps} taps.`);
      },
    });
  } catch (error) {
    clearMissTimeouts();
    appState.isSessionActive = false;
    setButtonsDisabled(false);
    setStatus("Error");
    setBeatIndicator(false, "Error");
    setTapStatus(`Session failed: ${error.message}`);
    resetLiveTimingFeedback("Session failed");
  }
}

function cancelSession() {
  if (!appState.isSessionActive) {
    return;
  }
  timingEngine.cancel("user");
}

function installKeyboardCapture() {
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") {
      return;
    }

    if (timingEngine.shouldTrapSpacebar()) {
      event.preventDefault();
    }

    if (event.repeat || appState.isSpaceHeld) {
      return;
    }
    appState.isSpaceHeld = true;
    if (timingEngine.isTapWindowOpen()) {
      metronome.tapFeedback();
    }

    const wasRecorded = timingEngine.registerTap();
    if (wasRecorded) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      appState.isSpaceHeld = false;
    }
  });

  window.addEventListener("blur", () => {
    appState.isSpaceHeld = false;
  });
}

function wireControls() {
  ui.generateBtn.addEventListener("click", generateNewExercise);
  ui.startBtn.addEventListener("click", () => runSession(1));
  ui.loopBtn.addEventListener("click", () => runSession(4));
  ui.cancelBtn.addEventListener("click", cancelSession);
  ui.levelSelect.addEventListener("change", generateNewExercise);
  ui.tempoSlider.addEventListener("input", (event) => applyTempoToExercise(event.target.value, "user"));
  ui.tempoInput.addEventListener("input", (event) => applyTempoToExercise(event.target.value, "user"));
  ui.clickSoundSelect.addEventListener("change", (event) => metronome.setSoundMode(event.target.value));
}

function init() {
  populateLevelSelector();
  metronome.setSoundMode(ui.clickSoundSelect.value);
  wireControls();
  installKeyboardCapture();
  setButtonsDisabled(false);
  resetLiveTimingFeedback();
  generateNewExercise();
}

init();
