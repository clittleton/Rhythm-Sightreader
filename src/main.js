import { Metronome } from "./audio/metronome.js";
import { getLevelConfig, listLevelIds } from "./config/levels.js";
import { gradeAttempt, gradeChallenge } from "./core/grader.js";
import { buildExpectedOnsetsMs, generateExercise, getExerciseDurationMs } from "./core/rhythmGenerator.js";
import { TimingEngine } from "./core/timingEngine.js";
import { clearFeedback, renderAttemptTable, renderLoopBreakdown, renderSummaryCards, renderTimeline } from "./ui/feedbackView.js";
import { renderNotation } from "./ui/notationView.js";

const ui = {
  levelSelect: document.getElementById("levelSelect"),
  generateBtn: document.getElementById("generateBtn"),
  startBtn: document.getElementById("startBtn"),
  loopBtn: document.getElementById("loopBtn"),
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
};

const metronome = new Metronome();
const timingEngine = new TimingEngine({ metronome });

const appState = {
  exercise: null,
  loopTapSets: [],
  loopResults: [],
  selectedTempoBpm: null,
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
}

function setBeatIndicator(active, label) {
  ui.beatIndicator.classList.toggle("active", active);
  ui.beatText.textContent = label;
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
  renderNotation(ui.notationContainer, exercise);
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
  const levelConfig = currentLevelConfig();
  appState.exercise = generateExercise(levelConfig);
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
}

function showLoopDetail(loopIndex) {
  if (!appState.loopResults.length) {
    return;
  }

  const safeIndex = Math.max(0, Math.min(appState.loopResults.length - 1, loopIndex));
  const result = appState.loopResults[safeIndex];
  const tapsMs = appState.loopTapSets[safeIndex];

  renderAttemptTable(ui.feedbackTableBody, appState.exercise.expectedOnsetsMs, tapsMs, result);
  renderTimeline(ui.timelineStrip, result);
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
  if (!appState.exercise) {
    generateNewExercise();
  }

  const sessionExercise = {
    ...appState.exercise,
    timeSignature: { ...appState.exercise.timeSignature },
    notes: appState.exercise.notes.map((note) => ({ ...note })),
    expectedOnsetsMs: [...appState.exercise.expectedOnsetsMs],
  };

  resetResults();
  setButtonsDisabled(true);
  setStatus("Starting");
  setTapStatus("Preparing audio and count-in...");

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
        }
      },
      onBeat: ({ phase, beatInMeasure }) => {
        const phaseText = phase === "count-in" ? "Count-in" : "Playing";
        setBeatIndicator(true, `${phaseText}: beat ${beatInMeasure}`);
      },
      onLoopStart: (loopNumber) => {
        if (loops > 1) {
          setTapStatus(`Loop ${loopNumber}/${loops} active. Press Space on each note.`);
        } else {
          setTapStatus("Attempt active. Press Space on each note.");
        }
      },
      onTap: ({ loop }) => {
        totalTapCount += 1;
        setTapStatus(`Loop ${loop}/${loops} active. Total taps: ${totalTapCount}`);
      },
      onComplete: ({ loopTapsMs }) => {
        appState.loopTapSets = loopTapsMs;
        setButtonsDisabled(false);
        setBeatIndicator(false, "Finished");

        if (loops === 1) {
          const result = gradeAttempt(sessionExercise.expectedOnsetsMs, loopTapsMs[0]);
          appState.loopResults = [result];
          renderSummaryCards(ui.summaryCards, result, "Attempt");
          renderAttemptTable(ui.feedbackTableBody, sessionExercise.expectedOnsetsMs, loopTapsMs[0], result);
          renderTimeline(ui.timelineStrip, result);
          setTapStatus(`Completed. Recorded ${loopTapsMs[0].length} taps.`);
          setStatus("Ready");
          return;
        }

        const challenge = gradeChallenge(sessionExercise.expectedOnsetsMs, loopTapsMs);
        appState.loopResults = challenge.loopResults;

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
    });
  } catch (error) {
    setButtonsDisabled(false);
    setStatus("Error");
    setBeatIndicator(false, "Error");
    setTapStatus(`Session failed: ${error.message}`);
  }
}

function installKeyboardCapture() {
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") {
      return;
    }

    if (timingEngine.shouldTrapSpacebar()) {
      event.preventDefault();
    }

    const wasRecorded = timingEngine.registerTap();
    if (wasRecorded) {
      event.preventDefault();
    }
  });
}

function wireControls() {
  ui.generateBtn.addEventListener("click", generateNewExercise);
  ui.startBtn.addEventListener("click", () => runSession(1));
  ui.loopBtn.addEventListener("click", () => runSession(4));
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
  generateNewExercise();
}

init();
