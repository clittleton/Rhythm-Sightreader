(function () {
  const PPQ = 480;
  const DURATION_TICKS = {
    w: PPQ * 4,
    h: PPQ * 2,
    q: PPQ,
    8: PPQ / 2,
    16: PPQ / 4,
  };

  const LEVELS = {
    1: {
      id: 1,
      allowedTimeSignatures: ["2/4", "4/4"],
      allowedDurations: ["q", "h", "w", "qr"],
      allowSyncopation: false,
      measuresPerExercise: 2,
      tempoRange: { min: 60, max: 84 },
      durationWeights: { w: 1, h: 2.5, q: 5, qr: 1.1 },
    },
    2: {
      id: 2,
      allowedTimeSignatures: ["2/4", "3/4", "4/4"],
      allowedDurations: ["q", "h", "8", "qr", "8r"],
      allowSyncopation: false,
      measuresPerExercise: 2,
      tempoRange: { min: 66, max: 92 },
      durationWeights: { h: 1.5, q: 4.5, 8: 3, qr: 0.9, "8r": 0.75 },
    },
    3: {
      id: 3,
      allowedTimeSignatures: ["3/4", "4/4", "6/8"],
      allowedDurations: ["q", "h", "8", "qr", "8r"],
      allowSyncopation: false,
      measuresPerExercise: 2,
      tempoRange: { min: 72, max: 104 },
      durationWeights: { h: 1.25, q: 3.5, 8: 4.5, qr: 0.8, "8r": 0.6 },
    },
    4: {
      id: 4,
      allowedTimeSignatures: ["4/4", "6/8", "7/8"],
      allowedDurations: ["q", "8", "16", "qr", "8r"],
      allowSyncopation: true,
      measuresPerExercise: 2,
      tempoRange: { min: 80, max: 118 },
      durationWeights: { q: 2.2, 8: 4.6, 16: 2.3, qr: 0.6, "8r": 0.45 },
      syncopationRate: 0.22,
    },
    5: {
      id: 5,
      allowedTimeSignatures: ["4/4", "5/4", "7/8"],
      allowedDurations: ["q", "8", "16", "qr", "8r"],
      allowSyncopation: true,
      measuresPerExercise: 2,
      tempoRange: { min: 88, max: 126 },
      durationWeights: { q: 1.9, 8: 4.1, 16: 3.2, qr: 0.45, "8r": 0.32 },
      syncopationRate: 0.34,
    },
  };

  function getLevelConfig(levelId) {
    const level = LEVELS[levelId];
    if (!level) {
      throw new Error("Unknown level: " + levelId);
    }
    return level;
  }

  function listLevelIds() {
    return Object.keys(LEVELS).map(Number);
  }

  function randomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function parseDurationCode(durationCode) {
    const isRest = durationCode.endsWith("r");
    const base = isRest ? durationCode.slice(0, -1) : durationCode;
    const ticks = DURATION_TICKS[base];
    if (!ticks) {
      throw new Error("Unsupported duration code: " + durationCode);
    }
    return { base: base, ticks: ticks, isRest: isRest };
  }

  function weightedChoice(candidates) {
    const total = candidates.reduce(function (sum, candidate) {
      return sum + candidate.weight;
    }, 0);
    let roll = Math.random() * total;
    for (const candidate of candidates) {
      roll -= candidate.weight;
      if (roll <= 0) {
        return candidate;
      }
    }
    return candidates[candidates.length - 1];
  }

  function parseTimeSignature(signature) {
    const parts = signature.split("/");
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den)) {
      throw new Error("Invalid time signature: " + signature);
    }
    return { num: num, den: den };
  }

  function cloneTimeSignature(timeSignature) {
    if (!timeSignature) {
      return null;
    }
    return {
      num: Number(timeSignature.num),
      den: Number(timeSignature.den),
    };
  }

  function timeSignatureToString(timeSignature) {
    if (!timeSignature) {
      return "";
    }
    return String(timeSignature.num) + "/" + String(timeSignature.den);
  }

  function getMeasureTicks(timeSignature) {
    return (PPQ * 4 * timeSignature.num) / timeSignature.den;
  }

  function chooseTimeSignature(levelConfig) {
    const options = levelConfig.allowedTimeSignatures;
    return parseTimeSignature(options[randomIntInclusive(0, options.length - 1)]);
  }

  function chooseTempo(levelConfig) {
    return randomIntInclusive(levelConfig.tempoRange.min, levelConfig.tempoRange.max);
  }

  function buildCandidates(args) {
    const levelConfig = args.levelConfig;
    const timeSignature = args.timeSignature;
    const remainingTicks = args.remainingTicks;
    const cursorInMeasure = args.cursorInMeasure;
    const previousToken = args.previousToken;
    const candidates = [];
    const beatTicks = (PPQ * 4) / timeSignature.den;

    for (const durationCode of levelConfig.allowedDurations) {
      const parsed = parseDurationCode(durationCode);
      if (parsed.ticks > remainingTicks) {
        continue;
      }

      let weight =
        levelConfig.durationWeights[durationCode] || levelConfig.durationWeights[parsed.base] || 1;

      if (parsed.isRest && previousToken && previousToken.isRest) {
        weight *= 0.35;
      }

      if (parsed.ticks >= PPQ && cursorInMeasure % beatTicks !== 0) {
        weight *= 0.45;
      }

      if (timeSignature.num === 6 && timeSignature.den === 8) {
        if (parsed.base === "8") {
          weight *= 1.45;
        }
        if (parsed.base === "16") {
          weight *= 0.8;
        }
      }

      if (levelConfig.id >= 5 && parsed.base === "16") {
        weight *= 1.4;
      }

      if (weight > 0) {
        candidates.push({
          durationCode: parsed.base,
          isRest: parsed.isRest,
          ticks: parsed.ticks,
          weight: weight,
        });
      }
    }

    return candidates;
  }

  function crossesBeatBoundary(tokenStartInMeasure, tokenTicks) {
    const beatTicks = PPQ;
    const startOffset = tokenStartInMeasure % beatTicks;
    const endOffset = (tokenStartInMeasure + tokenTicks) % beatTicks;
    return startOffset !== 0 && endOffset === 0;
  }

  function applySyncopationWithinMeasure(tokens, measureStartTick, syncopationRate) {
    for (let idx = 0; idx < tokens.length - 1; idx += 1) {
      const current = tokens[idx];
      const next = tokens[idx + 1];
      if (current.isRest || next.isRest) {
        continue;
      }
      if (current.durationCode === "16" || next.durationCode === "16") {
        continue;
      }
      const currentTicks = DURATION_TICKS[current.durationCode];
      const relativeStart = current.beatStartTicks - measureStartTick;
      if (!crossesBeatBoundary(relativeStart, currentTicks)) {
        continue;
      }
      if (Math.random() <= syncopationRate) {
        current.tieToNext = true;
      }
    }
  }

  function generateMeasure(levelConfig, timeSignature, measureStartTick, measureTicks) {
    let remainingTicks = measureTicks;
    let cursorInMeasure = 0;
    let safety = 0;
    const tokens = [];

    while (remainingTicks > 0 && safety < 256) {
      safety += 1;
      const previousToken = tokens[tokens.length - 1] || null;
      const candidates = buildCandidates({
        levelConfig: levelConfig,
        timeSignature: timeSignature,
        remainingTicks: remainingTicks,
        cursorInMeasure: cursorInMeasure,
        previousToken: previousToken,
      });

      if (!candidates.length) {
        throw new Error("Unable to fit measure with current constraints.");
      }

      const picked = weightedChoice(candidates);
      tokens.push({
        durationCode: picked.durationCode,
        beatStartTicks: measureStartTick + cursorInMeasure,
        isRest: picked.isRest,
        tieToNext: false,
      });

      cursorInMeasure += picked.ticks;
      remainingTicks -= picked.ticks;
    }

    if (remainingTicks !== 0) {
      throw new Error("Measure generation ended with remaining ticks.");
    }

    if (levelConfig.allowSyncopation) {
      applySyncopationWithinMeasure(tokens, measureStartTick, levelConfig.syncopationRate || 0.2);
    }

    if (!tokens.some(function (token) {
      return !token.isRest;
    })) {
      throw new Error("Generated silent measure.");
    }

    return tokens;
  }

  function buildExpectedOnsetsMs(tokens, tempoBpm) {
    const msPerTick = (60000 / tempoBpm) / PPQ;
    const onsets = [];
    for (let idx = 0; idx < tokens.length; idx += 1) {
      const token = tokens[idx];
      const previous = tokens[idx - 1];
      if (token.isRest) {
        continue;
      }
      if (previous && previous.tieToNext) {
        continue;
      }
      onsets.push(Math.round(token.beatStartTicks * msPerTick));
    }
    return onsets;
  }

  function getExerciseDurationMs(tokens, tempoBpm) {
    if (!tokens.length) {
      return 0;
    }
    const last = tokens[tokens.length - 1];
    const lastDurationTicks = DURATION_TICKS[last.durationCode];
    const totalTicks = last.beatStartTicks + lastDurationTicks;
    const msPerTick = (60000 / tempoBpm) / PPQ;
    return Math.round(totalTicks * msPerTick);
  }

  function generateExercise(levelConfig, options) {
    const config = options || {};
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const timeSignature = config.timeSignature
        ? { ...config.timeSignature }
        : chooseTimeSignature(levelConfig);
      const tempoBpm =
        typeof config.tempoBpm === "number" ? clampTempo(config.tempoBpm) : chooseTempo(levelConfig);
      const measuresPerExercise = Math.max(
        1,
        Number(config.measuresPerExercise) || levelConfig.measuresPerExercise,
      );
      const measureTicks = getMeasureTicks(timeSignature);
      let notes = [];

      try {
        for (let measure = 0; measure < measuresPerExercise; measure += 1) {
          const measureStartTick = measure * measureTicks;
          notes = notes.concat(
            generateMeasure(levelConfig, timeSignature, measureStartTick, measureTicks),
          );
        }
      } catch (error) {
        continue;
      }

      const expectedOnsetsMs = buildExpectedOnsetsMs(notes, tempoBpm);
      if (!expectedOnsetsMs.length) {
        continue;
      }

      return {
        level: levelConfig.id,
        timeSignature: timeSignature,
        tempoBpm: tempoBpm,
        notes: notes,
        expectedOnsetsMs: expectedOnsetsMs,
        measureTicks: measureTicks,
        measuresPerExercise: measuresPerExercise,
        totalDurationMs: getExerciseDurationMs(notes, tempoBpm),
      };
    }
    throw new Error("Failed to generate a valid exercise after multiple attempts.");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function scoreOffset(offsetMs) {
    if (offsetMs === null || Number.isNaN(offsetMs)) {
      return 0;
    }
    const abs = Math.abs(offsetMs);
    if (abs <= 50) {
      return 100;
    }
    if (abs <= 100) {
      return 70;
    }
    return 30;
  }

  function classifyTiming(offsetMs) {
    if (offsetMs === null || Number.isNaN(offsetMs)) {
      return "miss";
    }
    const abs = Math.abs(offsetMs);
    if (abs <= 50) {
      return "good";
    }
    if (abs <= 100) {
      return "warn";
    }
    return "bad";
  }

  function alignTapsToExpected(expectedOnsetsMs, tapOnsetsMs) {
    const n = expectedOnsetsMs.length;
    const m = tapOnsetsMs.length;
    const missCost = 160;
    const extraCost = 120;

    const dp = Array.from({ length: n + 1 }, function () {
      return Array(m + 1).fill(Number.POSITIVE_INFINITY);
    });
    const parent = Array.from({ length: n + 1 }, function () {
      return Array(m + 1).fill(null);
    });

    dp[0][0] = 0;

    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= m; j += 1) {
        const current = dp[i][j];
        if (!Number.isFinite(current)) {
          continue;
        }

        if (i < n && j < m) {
          const matchCost = Math.abs(tapOnsetsMs[j] - expectedOnsetsMs[i]);
          const candidate = current + matchCost;
          if (candidate < dp[i + 1][j + 1]) {
            dp[i + 1][j + 1] = candidate;
            parent[i + 1][j + 1] = { prevI: i, prevJ: j, op: "match" };
          }
        }

        if (i < n) {
          const candidate = current + missCost;
          if (candidate < dp[i + 1][j]) {
            dp[i + 1][j] = candidate;
            parent[i + 1][j] = { prevI: i, prevJ: j, op: "miss" };
          }
        }

        if (j < m) {
          const candidate = current + extraCost;
          if (candidate < dp[i][j + 1]) {
            dp[i][j + 1] = candidate;
            parent[i][j + 1] = { prevI: i, prevJ: j, op: "extra" };
          }
        }
      }
    }

    const matchedTapIndices = Array(n).fill(-1);
    const extraTapIndices = [];
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
      const step = parent[i][j];
      if (!step) {
        break;
      }
      if (step.op === "match") {
        matchedTapIndices[step.prevI] = step.prevJ;
      } else if (step.op === "extra") {
        extraTapIndices.push(step.prevJ);
      }
      i = step.prevI;
      j = step.prevJ;
    }

    extraTapIndices.reverse();
    return { matchedTapIndices: matchedTapIndices, extraTapIndices: extraTapIndices };
  }

  function gradeAttempt(expectedOnsetsMs, tapOnsetsMs) {
    const aligned = alignTapsToExpected(expectedOnsetsMs, tapOnsetsMs);

    const tapOffsetsMs = expectedOnsetsMs.map(function (expected, idx) {
      const tapIndex = aligned.matchedTapIndices[idx];
      if (tapIndex === -1) {
        return null;
      }
      return Math.round(tapOnsetsMs[tapIndex] - expected);
    });

    const perNoteScore = tapOffsetsMs.map(scoreOffset);
    const missedCount = aligned.matchedTapIndices.filter(function (idx) {
      return idx === -1;
    }).length;
    const extraTapCount = aligned.extraTapIndices.length;
    const missedNotePenalty = 8;
    const extraTapPenalty = 5;
    const rawAverage =
      perNoteScore.reduce(function (sum, score) {
        return sum + score;
      }, 0) / Math.max(perNoteScore.length, 1);
    const overallAccuracy = clamp(
      Math.round(rawAverage - missedCount * missedNotePenalty - extraTapCount * extraTapPenalty),
      0,
      100,
    );

    const matchedOffsets = tapOffsetsMs.filter(function (offset) {
      return offset !== null;
    });

    const meanOffset = matchedOffsets.length
      ? matchedOffsets.reduce(function (sum, value) {
          return sum + value;
        }, 0) / matchedOffsets.length
      : 0;

    let timingLabel = "on-time";
    if (meanOffset > 20) {
      timingLabel = "late";
    } else if (meanOffset < -20) {
      timingLabel = "early";
    }

    return {
      tapOffsetsMs: tapOffsetsMs,
      perNoteScore: perNoteScore,
      overallAccuracy: overallAccuracy,
      timingLabel: timingLabel,
      missedCount: missedCount,
      extraTapCount: extraTapCount,
      matchedTapIndices: aligned.matchedTapIndices,
      extraTapIndices: aligned.extraTapIndices,
      perNoteClass: tapOffsetsMs.map(classifyTiming),
    };
  }

  function gradeChallenge(expectedOnsetsMs, loopTapsMs) {
    const loopResults = loopTapsMs.map(function (taps) {
      return gradeAttempt(expectedOnsetsMs, taps);
    });

    const averageScore = Math.round(
      loopResults.reduce(function (sum, result) {
        return sum + result.overallAccuracy;
      }, 0) / Math.max(loopResults.length, 1),
    );

    return { loopResults: loopResults, averageScore: averageScore };
  }

  function scoreClassFromOffset(offset) {
    if (offset === null) {
      return "timing-bad";
    }
    const abs = Math.abs(offset);
    if (abs <= 50) {
      return "timing-good";
    }
    if (abs <= 100) {
      return "timing-warn";
    }
    return "timing-bad";
  }

  function timelineClass(offset) {
    if (offset === null) {
      return "bad";
    }
    const abs = Math.abs(offset);
    if (abs <= 50) {
      return "good";
    }
    if (abs <= 100) {
      return "warn";
    }
    return "bad";
  }

  function timingWord(offset) {
    if (offset === null) {
      return "Miss";
    }
    if (offset < 0) {
      return "Early";
    }
    if (offset > 0) {
      return "Late";
    }
    return "On time";
  }

  function clearFeedback(view) {
    if (view.summaryCardsEl) {
      view.summaryCardsEl.innerHTML = "";
    }
    if (view.tableBodyEl) {
      view.tableBodyEl.innerHTML = "";
    }
    if (view.timelineEl) {
      view.timelineEl.innerHTML = "";
    }
    if (view.loopBreakdownEl) {
      view.loopBreakdownEl.innerHTML = "";
    }
  }

  function renderSummaryCards(summaryCardsEl, result, title) {
    if (!summaryCardsEl) {
      return;
    }
    const safeTitle = title || "Attempt";
    summaryCardsEl.innerHTML = "";

    const cards = [
      { label: safeTitle + " Score", value: result.overallAccuracy + "%" },
      { label: "Timing Bias", value: result.timingLabel },
      { label: "Missed Notes", value: String(result.missedCount) },
      { label: "Extra Taps", value: String(result.extraTapCount) },
    ];

    cards.forEach(function (card) {
      const block = document.createElement("article");
      block.className = "summary-card";
      block.innerHTML = "<h3>" + card.label + "</h3><strong>" + card.value + "</strong>";
      summaryCardsEl.append(block);
    });
  }

  function renderLoopBreakdown(loopBreakdownEl, loopResults, averageScore) {
    if (!loopBreakdownEl) {
      return;
    }
    loopBreakdownEl.innerHTML = "";
    const averageChip = document.createElement("div");
    averageChip.className = "loop-pill";
    averageChip.textContent = "4-loop average: " + averageScore + "%";
    loopBreakdownEl.append(averageChip);

    loopResults.forEach(function (result, index) {
      const pill = document.createElement("div");
      pill.className = "loop-pill";
      pill.textContent =
        "Loop " + (index + 1) + ": " + result.overallAccuracy + "% (" + result.timingLabel + ")";
      loopBreakdownEl.append(pill);
    });
  }

  function renderAttemptTable(tableBodyEl, expectedOnsetsMs, tapsMs, result) {
    if (!tableBodyEl) {
      return;
    }
    tableBodyEl.innerHTML = "";

    expectedOnsetsMs.forEach(function (expected, noteIndex) {
      const row = document.createElement("tr");
      const offset = result.tapOffsetsMs[noteIndex];
      const tapIndex = result.matchedTapIndices[noteIndex];
      const actual = tapIndex === -1 ? null : tapsMs[tapIndex];

      row.className = scoreClassFromOffset(offset);
      row.innerHTML =
        "<td>" +
        (noteIndex + 1) +
        "</td><td>" +
        expected +
        "</td><td>" +
        (actual === null ? "-" : actual) +
        "</td><td>" +
        (offset === null ? "Miss" : offset) +
        "</td><td>" +
        timingWord(offset) +
        "</td>";

      tableBodyEl.append(row);
    });
  }

  function renderTimeline(timelineEl, result) {
    if (!timelineEl) {
      return;
    }
    timelineEl.innerHTML = "";

    result.tapOffsetsMs.forEach(function (offset, idx) {
      const row = document.createElement("div");
      row.className = "timeline-row";
      row.setAttribute("aria-label", "Note " + (idx + 1));

      const center = document.createElement("span");
      center.className = "timeline-center";
      row.append(center);

      if (offset === null) {
        const miss = document.createElement("span");
        miss.className = "timeline-miss";
        miss.textContent = "X";
        row.append(miss);
        timelineEl.append(row);
        return;
      }

      const dot = document.createElement("span");
      dot.className = "timeline-dot " + timelineClass(offset);
      const clampedOffset = Math.max(-220, Math.min(220, offset));
      const left = 50 + (clampedOffset / 220) * 45;
      dot.style.left = left + "%";
      dot.title = offset + " ms";
      row.append(dot);
      timelineEl.append(row);
    });
  }

  function assertVexFlow() {
    if (!window.Vex || !window.Vex.Flow) {
      throw new Error("VexFlow is not available.");
    }
    return window.Vex.Flow;
  }

  function toVexDuration(token) {
    return token.durationCode + (token.isRest ? "r" : "");
  }

  function splitByMeasure(tokens, measuresPerExercise, measureTicks) {
    const grouped = Array.from({ length: measuresPerExercise }, function () {
      return [];
    });
    tokens.forEach(function (token, tokenIndex) {
      const measureIndex = Math.floor(token.beatStartTicks / measureTicks);
      grouped[measureIndex].push({ token: token, tokenIndex: tokenIndex });
    });
    return grouped;
  }

  function renderFallback(container, message) {
    container.innerHTML = '<p style="padding:12px;color:#7f2d2d;">' + message + "</p>";
  }

  const READABLE_CHUNKS = [
    { durationCode: "w", dots: 0, ticks: 1920 },
    { durationCode: "h", dots: 1, ticks: 1440 },
    { durationCode: "h", dots: 0, ticks: 960 },
    { durationCode: "q", dots: 1, ticks: 720 },
    { durationCode: "q", dots: 0, ticks: 480 },
    { durationCode: "8", dots: 1, ticks: 360 },
    { durationCode: "8", dots: 0, ticks: 240 },
    { durationCode: "16", dots: 1, ticks: 180 },
    { durationCode: "16", dots: 0, ticks: 120 },
  ];

  const LIVE_FEEDBACK_X_OFFSET_PX = 4;

  const NOOP_LIVE_FEEDBACK = {
    flashTap: function () {},
    flashMiss: function () {},
    startPlayhead: function () {},
    stopPlayhead: function () {},
    clear: function () {},
  };

  function getBeamGroups(VF, timeSignature) {
    const num = timeSignature.num;
    const den = timeSignature.den;

    if (den === 4) {
      return Array.from({ length: num }, function () {
        return new VF.Fraction(1, 4);
      });
    }

    if (num === 6 && den === 8) {
      return [new VF.Fraction(3, 8), new VF.Fraction(3, 8)];
    }

    if (num === 7 && den === 8) {
      return [new VF.Fraction(2, 8), new VF.Fraction(2, 8), new VF.Fraction(3, 8)];
    }

    if (den === 8) {
      return Array.from({ length: num }, function () {
        return new VF.Fraction(1, 8);
      });
    }

    return [new VF.Fraction(1, den)];
  }

  function getBeatGroupTicks(timeSignature) {
    const num = timeSignature.num;
    const den = timeSignature.den;

    if (den === 4) {
      return Array.from({ length: num }, function () {
        return PPQ;
      });
    }

    if (num === 6 && den === 8) {
      return [PPQ + PPQ / 2, PPQ + PPQ / 2];
    }

    if (num === 7 && den === 8) {
      return [PPQ, PPQ, PPQ + PPQ / 2];
    }

    if (den === 8) {
      return Array.from({ length: num }, function () {
        return PPQ / 2;
      });
    }

    return [(PPQ * 4 * num) / den];
  }

  function getBeatBoundaries(measureStartTick, measureTicks, timeSignature) {
    const groups = getBeatGroupTicks(timeSignature);
    const boundaries = [];
    let cursor = measureStartTick;

    groups.forEach(function (groupTicks) {
      cursor += groupTicks;
      boundaries.push(cursor);
    });

    const measureEndTick = measureStartTick + measureTicks;
    boundaries[boundaries.length - 1] = measureEndTick;
    return boundaries;
  }

  function nextBoundaryAfterTick(tick, boundaries, measureEndTick) {
    for (const boundary of boundaries) {
      if (boundary > tick) {
        return boundary;
      }
    }
    return measureEndTick;
  }

  function decomposeTicksToReadableValues(ticks) {
    let remaining = ticks;
    const chunks = [];

    for (const chunk of READABLE_CHUNKS) {
      while (remaining >= chunk.ticks) {
        chunks.push(chunk);
        remaining -= chunk.ticks;
      }
    }

    if (remaining !== 0) {
      throw new Error("Unable to decompose " + ticks + " ticks into readable notation chunks.");
    }

    return chunks;
  }

  function splitTokenAtBeatBoundaries(token, boundaries, measureEndTick) {
    const durationTicks = DURATION_TICKS[token.durationCode];
    if (!durationTicks) {
      throw new Error("Unsupported token duration: " + token.durationCode);
    }

    const slices = [];
    let sliceStart = token.beatStartTicks;
    let remaining = durationTicks;

    while (remaining > 0) {
      const boundary = nextBoundaryAfterTick(sliceStart, boundaries, measureEndTick);
      const sliceTicks = Math.min(remaining, boundary - sliceStart);
      slices.push({ startTick: sliceStart, ticks: sliceTicks });
      sliceStart += sliceTicks;
      remaining -= sliceTicks;
    }

    return slices;
  }

  function expandMeasureTokensForDisplay(measureTokens, boundaries, measureEndTick) {
    const displayTokens = [];

    measureTokens.forEach(function (entry) {
      const token = entry.token;
      const slices = splitTokenAtBeatBoundaries(token, boundaries, measureEndTick);
      const exploded = [];

      slices.forEach(function (slice) {
        const chunks = decomposeTicksToReadableValues(slice.ticks);
        let cursor = slice.startTick;

        chunks.forEach(function (chunk) {
          exploded.push({
            durationCode: chunk.durationCode,
            dots: chunk.dots,
            beatStartTicks: cursor,
            isRest: token.isRest,
            tieToNext: false,
          });
          cursor += chunk.ticks;
        });
      });

      if (token.isRest) {
        displayTokens.push(...exploded);
        return;
      }

      exploded.forEach(function (chunkToken, idx) {
        const isLast = idx === exploded.length - 1;
        chunkToken.tieToNext = !isLast || token.tieToNext;
        displayTokens.push(chunkToken);
      });
    });

    return displayTokens;
  }

  function validateExerciseForDisplay(exercise) {
    if (!exercise || !Array.isArray(exercise.notes) || !exercise.notes.length) {
      throw new Error("Generated exercise has no notes.");
    }
    if (!Number.isFinite(exercise.measureTicks) || exercise.measureTicks <= 0) {
      throw new Error("Generated exercise has invalid measure length.");
    }
    if (!Number.isInteger(exercise.measuresPerExercise) || exercise.measuresPerExercise < 1) {
      throw new Error("Generated exercise has invalid measure count.");
    }

    const groupedMeasures = splitByMeasure(
      exercise.notes,
      exercise.measuresPerExercise,
      exercise.measureTicks,
    );

    groupedMeasures.forEach(function (measureTokens, measureIndex) {
      const measureNumber = measureIndex + 1;
      if (!measureTokens.length) {
        throw new Error("Generated empty measure " + measureNumber + ".");
      }

      const measureStartTick = measureIndex * exercise.measureTicks;
      const measureEndTick = measureStartTick + exercise.measureTicks;
      const totalTicks = measureTokens.reduce(function (sum, entry) {
        const tokenTicks = DURATION_TICKS[entry.token.durationCode];
        if (!tokenTicks) {
          throw new Error("Unsupported token duration in measure " + measureNumber + ".");
        }
        if (
          entry.token.beatStartTicks < measureStartTick ||
          entry.token.beatStartTicks >= measureEndTick
        ) {
          throw new Error("Token escaped measure " + measureNumber + ".");
        }
        return sum + tokenTicks;
      }, 0);

      if (totalTicks !== exercise.measureTicks) {
        throw new Error("Measure " + measureNumber + " does not fill the bar.");
      }

      const beatBoundaries = getBeatBoundaries(
        measureStartTick,
        exercise.measureTicks,
        exercise.timeSignature,
      );
      const displayTokens = expandMeasureTokensForDisplay(
        measureTokens,
        beatBoundaries,
        measureEndTick,
      );

      if (!displayTokens.length) {
        throw new Error("Measure " + measureNumber + " has no displayable notes.");
      }
    });

    if (!Array.isArray(exercise.expectedOnsetsMs) || !exercise.expectedOnsetsMs.length) {
      throw new Error("Generated exercise has no playable onsets.");
    }

    return true;
  }

  function createValidatedExercise(levelConfig, options) {
    let lastError = null;
    for (let attempt = 0; attempt < 48; attempt += 1) {
      try {
        const exercise = generateExercise(levelConfig, options);
        validateExerciseForDisplay(exercise);
        validateExerciseRenderableWithVexFlow(exercise);
        return exercise;
      } catch (error) {
        lastError = error;
      }
    }

    recordArcadeDiagnostic("generation-failed", {
      level: levelConfig?.id || null,
      options: options || null,
      error: lastError ? lastError.message : "unknown",
    });

    throw new Error(
      "Failed to generate a renderable exercise" + (lastError ? ": " + lastError.message : "."),
    );
  }

  function validateExerciseRenderableWithVexFlow(exercise) {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      !document.body ||
      !window.Vex ||
      !window.Vex.Flow
    ) {
      return true;
    }

    const VF = assertVexFlow();
    const sandbox = document.createElement("div");
    sandbox.setAttribute("aria-hidden", "true");
    sandbox.style.position = "absolute";
    sandbox.style.left = "-99999px";
    sandbox.style.top = "-99999px";
    sandbox.style.width = "960px";
    sandbox.style.height = "240px";
    sandbox.style.overflow = "hidden";
    sandbox.style.opacity = "0";
    sandbox.style.pointerEvents = "none";
    document.body.append(sandbox);

    try {
      const renderer = new VF.Renderer(sandbox, VF.Renderer.Backends.SVG);
      renderer.resize(960, 240);
      drawExerciseSystem({
        VF: VF,
        context: renderer.getContext(),
        exercise: exercise,
        topY: 34,
        width: 960,
        showTimeSignature: true,
      });
      return true;
    } finally {
      sandbox.remove();
    }
  }

  function getArcadeOpeningTimeSignature(levelId) {
    const levelConfig = getLevelConfig(levelId);
    return parseTimeSignature(levelConfig.allowedTimeSignatures[0] || "4/4");
  }

  function getNextArcadeTimeSignature(levelId, currentTimeSignature) {
    const levelConfig = getLevelConfig(levelId);
    const allowed = Array.isArray(levelConfig.allowedTimeSignatures)
      ? levelConfig.allowedTimeSignatures
      : [];

    if (!allowed.length) {
      return parseTimeSignature("4/4");
    }

    const currentKey = timeSignatureToString(currentTimeSignature);
    const currentIndex = allowed.indexOf(currentKey);
    if (currentIndex === -1) {
      return parseTimeSignature(allowed[0]);
    }

    return parseTimeSignature(allowed[Math.min(allowed.length - 1, currentIndex + 1)]);
  }

  function maybeAdvanceArcadeTimeSignature(result) {
    const levelConfig = getLevelConfig(appState.arcade.currentLevel);
    const allowed = Array.isArray(levelConfig.allowedTimeSignatures)
      ? levelConfig.allowedTimeSignatures
      : [];
    if (!allowed.length) {
      return;
    }

    const currentKey = timeSignatureToString(appState.arcade.currentTimeSignature);
    if (!currentKey || !allowed.includes(currentKey)) {
      appState.arcade.currentTimeSignature = getArcadeOpeningTimeSignature(appState.arcade.currentLevel);
      return;
    }

    const strongClear =
      !!result &&
      result.overallAccuracy >= 88 &&
      result.missedCount <= 1 &&
      result.extraTapCount <= 1;
    const shouldAdvance = strongClear && appState.arcade.rhythmsCleared > 0 && appState.arcade.rhythmsCleared % 3 === 0;

    if (!shouldAdvance) {
      return;
    }

    const nextTimeSignature = getNextArcadeTimeSignature(
      appState.arcade.currentLevel,
      appState.arcade.currentTimeSignature,
    );
    const nextKey = timeSignatureToString(nextTimeSignature);
    if (!nextKey || nextKey === currentKey) {
      return;
    }

    appState.arcade.currentTimeSignature = nextTimeSignature;
    recordArcadeDiagnostic("meter-change-planned", {
      level: appState.arcade.currentLevel,
      from: currentKey,
      to: nextKey,
      rhythmsCleared: appState.arcade.rhythmsCleared,
    });
    setArcadeBanner("METER SHIFT " + nextKey, "boost");
    spawnArcadeFloat(nextKey, "boost", "md");
  }

  function hideFlagsForBeamedNotes(beams) {
    beams.forEach(function (beam) {
      const beamNotes = typeof beam.getNotes === "function" ? beam.getNotes() : beam.notes;
      if (!beamNotes) {
        return;
      }
      beamNotes.forEach(function (note) {
        if (note && note.render_options && Object.hasOwn(note.render_options, "draw_flag")) {
          note.render_options.draw_flag = false;
        }
        if (note && typeof note.setFlagStyle === "function") {
          note.setFlagStyle({ fillStyle: "transparent", strokeStyle: "transparent" });
        }
      });
    });
  }

  function applyDotsToNote(VF, staveNote, dotCount) {
    for (let dot = 0; dot < dotCount; dot += 1) {
      if (typeof staveNote.addDotToAll === "function") {
        staveNote.addDotToAll();
        continue;
      }

      if (typeof staveNote.addDot === "function") {
        staveNote.addDot(0);
        continue;
      }

      if (VF.Dot && VF.Dot.buildAndAttach) {
        VF.Dot.buildAndAttach([staveNote], { all: true });
      }
    }
  }

  function getAnalysisDotColor(offsetMs) {
    if (typeof offsetMs !== "number" || Number.isNaN(offsetMs)) {
      return "#aa2e2e";
    }
    const abs = Math.abs(offsetMs);
    if (abs <= 50) {
      return "#177245";
    }
    if (abs <= 100) {
      return "#ab6f00";
    }
    return "#aa2e2e";
  }

  function getTimingBucket(offsetMs) {
    if (typeof offsetMs !== "number" || Number.isNaN(offsetMs)) {
      return "bad";
    }
    const abs = Math.abs(offsetMs);
    if (abs <= 50) {
      return "good";
    }
    if (abs <= 100) {
      return "warn";
    }
    return "bad";
  }

  function findNearestOnsetIndex(expectedOnsetsMs, tapMs) {
    if (!expectedOnsetsMs.length) {
      return -1;
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
    return rightGap < leftGap ? rightIndex : leftIndex;
  }

  function addSvgAnimate(svgNs, element, attributeName, values, durationMs) {
    const animate = document.createElementNS(svgNs, "animate");
    animate.setAttribute("attributeName", attributeName);
    animate.setAttribute("values", values);
    animate.setAttribute("dur", durationMs + "ms");
    animate.setAttribute("begin", "indefinite");
    animate.setAttribute("fill", "freeze");
    element.append(animate);
    return animate;
  }

  function createMovingPlayheadController(
    container,
    onsetAnchors,
    expectedOnsetsMs,
    loopDurationMs,
    timelineBounds,
    options,
  ) {
    if (
      !Array.isArray(onsetAnchors) ||
      !onsetAnchors.length ||
      !Array.isArray(expectedOnsetsMs) ||
      !expectedOnsetsMs.length
    ) {
      return {
        startPlayhead: function () {},
        stopPlayhead: function () {},
      };
    }

    const svg = container.querySelector("svg");
    if (!svg) {
      return {
        startPlayhead: function () {},
        stopPlayhead: function () {},
      };
    }

    const svgNs = "http://www.w3.org/2000/svg";
    const layer = document.createElementNS(svgNs, "g");
    layer.setAttribute("class", "moving-playhead-layer");

    const line = document.createElementNS(svgNs, "line");
    line.setAttribute("class", "moving-playhead-line");
    const minY = Math.min(...onsetAnchors.map(function (anchor) {
      return anchor.y;
    }));
    const maxY = Math.max(...onsetAnchors.map(function (anchor) {
      return anchor.y;
    }));
    line.setAttribute("y1", String(Math.max(14, minY - 36)));
    line.setAttribute("y2", String(maxY + 18));
    line.setAttribute("opacity", "0");

    layer.append(line);
    svg.append(layer);

    const width = Number(svg.getAttribute("width")) || svg.clientWidth || 760;
    const minBoundX = 18;
    const maxBoundX = Math.max(minBoundX + 1, width - 18);

    let rafId = null;
    let running = false;
    let startedAtMs = 0;
    const config = options || {};
    const onProgress = typeof config.onProgress === "function" ? config.onProgress : null;
    let activeLoopMs = Math.max(
      1,
      loopDurationMs || expectedOnsetsMs[expectedOnsetsMs.length - 1] || 1,
    );

    const placeLineAtMs = function (elapsedMs) {
      const clampedMs = Math.max(0, Math.min(activeLoopMs, elapsedMs));
      const mappedX = mapTapMsToAnchorX(
        clampedMs,
        expectedOnsetsMs,
        onsetAnchors,
        activeLoopMs,
        timelineBounds,
      );
      if (mappedX === null) {
        return;
      }
      const x = Math.max(
        minBoundX,
        Math.min(maxBoundX, mappedX + LIVE_FEEDBACK_X_OFFSET_PX),
      );
      line.setAttribute("x1", String(x));
      line.setAttribute("x2", String(x));
    };

    const stopPlayhead = function () {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      line.setAttribute("opacity", "0");
    };

    const tick = function (nowMs) {
      if (!running) {
        return;
      }
      try {
        const elapsedMs = nowMs - startedAtMs;
        placeLineAtMs(elapsedMs);
        if (onProgress) {
          onProgress(Math.max(0, Math.min(activeLoopMs, elapsedMs)), activeLoopMs);
        }
        if (elapsedMs >= activeLoopMs) {
          stopPlayhead();
          return;
        }
        rafId = requestAnimationFrame(tick);
      } catch (error) {
        stopPlayhead();
        handleArcadeRuntimeError(error, {
          label: "playhead-raf",
        });
      }
    };

    const startPlayhead = function (loopMs, originMs) {
      stopPlayhead();
      activeLoopMs = Math.max(1, loopMs || activeLoopMs);
      startedAtMs = typeof originMs === "number" ? originMs : performance.now();
      placeLineAtMs(0);
      if (onProgress) {
        onProgress(0, activeLoopMs);
      }
      line.setAttribute("opacity", "0.95");
      running = true;
      rafId = requestAnimationFrame(tick);
    };

    return {
      startPlayhead: startPlayhead,
      stopPlayhead: stopPlayhead,
    };
  }

  function createLiveNoteFeedbackLayer(
    container,
    onsetAnchors,
    expectedOnsetsMs,
    totalDurationMs,
    timelineBounds,
    options,
  ) {
    if (
      !Array.isArray(onsetAnchors) ||
      !onsetAnchors.length ||
      !Array.isArray(expectedOnsetsMs) ||
      !expectedOnsetsMs.length
    ) {
      return NOOP_LIVE_FEEDBACK;
    }

    const svg = container.querySelector("svg");
    if (!svg) {
      return NOOP_LIVE_FEEDBACK;
    }

    const svgNs = "http://www.w3.org/2000/svg";
    const layer = document.createElementNS(svgNs, "g");
    layer.setAttribute("class", "live-note-feedback-layer");
    svg.append(layer);
    const width = Number(svg.getAttribute("width")) || svg.clientWidth || 760;
    const minBoundX = 18;
    const maxBoundX = Math.max(minBoundX + 1, width - 18);

    const flashTap = function (tapMs, offsetMs) {
      const mappedX = mapTapMsToAnchorX(
        tapMs,
        expectedOnsetsMs,
        onsetAnchors,
        totalDurationMs,
        timelineBounds,
      );
      if (mappedX === null) {
        return;
      }
      const clampedX = Math.max(
        minBoundX,
        Math.min(maxBoundX, mappedX + LIVE_FEEDBACK_X_OFFSET_PX),
      );
      const nearestIndex = findNearestOnsetIndex(expectedOnsetsMs, tapMs);
      const anchorY = onsetAnchors[nearestIndex] ? onsetAnchors[nearestIndex].y : onsetAnchors[0].y;

      const bucket = getTimingBucket(offsetMs);

      const impactRing = document.createElementNS(svgNs, "circle");
      impactRing.setAttribute("cx", String(clampedX));
      impactRing.setAttribute("cy", String(anchorY));
      impactRing.setAttribute("r", "4.4");
      impactRing.setAttribute("class", "note-hit-impact " + bucket);
      impactRing.setAttribute("opacity", "0.95");

      const corePulse = document.createElementNS(svgNs, "circle");
      corePulse.setAttribute("cx", String(clampedX));
      corePulse.setAttribute("cy", String(anchorY));
      corePulse.setAttribute("r", "3.4");
      corePulse.setAttribute("class", "note-hit-core " + bucket);
      corePulse.setAttribute("opacity", "0.95");

      const impactAnimations = [
        addSvgAnimate(svgNs, impactRing, "r", "4.4;12.2", 260),
        addSvgAnimate(svgNs, impactRing, "opacity", "0.95;0", 260),
      ];
      const coreAnimations = [
        addSvgAnimate(svgNs, corePulse, "r", "3.4;5.1;3.1", 180),
        addSvgAnimate(svgNs, corePulse, "opacity", "0.95;0.78;0", 180),
      ];

      layer.append(impactRing);
      layer.append(corePulse);

      impactAnimations.concat(coreAnimations).forEach(function (animation) {
        if (typeof animation.beginElement === "function") {
          animation.beginElement();
        }
      });

      setTimeout(function () {
        impactRing.remove();
        corePulse.remove();
      }, 340);
    };

    const flashMiss = function (expectedIndex) {
      const anchor = onsetAnchors[expectedIndex];
      if (!anchor) {
        return;
      }

      const x = Math.max(
        minBoundX,
        Math.min(maxBoundX, anchor.x + LIVE_FEEDBACK_X_OFFSET_PX),
      );
      const y = anchor.y;

      const missHalo = document.createElementNS(svgNs, "circle");
      missHalo.setAttribute("cx", String(x));
      missHalo.setAttribute("cy", String(y));
      missHalo.setAttribute("r", "7.2");
      missHalo.setAttribute("class", "note-miss-halo");
      missHalo.setAttribute("opacity", "0.9");

      const missSlashA = document.createElementNS(svgNs, "line");
      missSlashA.setAttribute("x1", String(x - 4.1));
      missSlashA.setAttribute("y1", String(y - 4.1));
      missSlashA.setAttribute("x2", String(x + 4.1));
      missSlashA.setAttribute("y2", String(y + 4.1));
      missSlashA.setAttribute("class", "note-miss-slash");
      missSlashA.setAttribute("opacity", "0.95");

      const missSlashB = document.createElementNS(svgNs, "line");
      missSlashB.setAttribute("x1", String(x - 4.1));
      missSlashB.setAttribute("y1", String(y + 4.1));
      missSlashB.setAttribute("x2", String(x + 4.1));
      missSlashB.setAttribute("y2", String(y - 4.1));
      missSlashB.setAttribute("class", "note-miss-slash");
      missSlashB.setAttribute("opacity", "0.95");

      const animations = [
        addSvgAnimate(svgNs, missHalo, "r", "7.2;9.4", 210),
        addSvgAnimate(svgNs, missHalo, "opacity", "0.9;0", 230),
        addSvgAnimate(svgNs, missSlashA, "opacity", "0.95;0", 220),
        addSvgAnimate(svgNs, missSlashB, "opacity", "0.95;0", 220),
      ];

      layer.append(missHalo);
      layer.append(missSlashA);
      layer.append(missSlashB);

      animations.forEach(function (animation) {
        if (typeof animation.beginElement === "function") {
          animation.beginElement();
        }
      });

      setTimeout(function () {
        missHalo.remove();
        missSlashA.remove();
        missSlashB.remove();
      }, 280);
    };

    const playhead = createMovingPlayheadController(
      container,
      onsetAnchors,
      expectedOnsetsMs,
      totalDurationMs,
      timelineBounds,
      options,
    );

    return {
      flashTap: flashTap,
      flashMiss: flashMiss,
      startPlayhead: playhead.startPlayhead,
      stopPlayhead: playhead.stopPlayhead,
      clear: function () {
        layer.innerHTML = "";
      },
    };
  }

  function mapTapMsToAnchorX(
    tapMs,
    expectedOnsetsMs,
    onsetAnchors,
    totalDurationMs,
    timelineBounds,
  ) {
    const count = Math.min(expectedOnsetsMs.length, onsetAnchors.length);
    if (count === 0) {
      return null;
    }

    const times = [];
    const positions = [];
    const canUseBounds =
      timelineBounds &&
      Number.isFinite(timelineBounds.startX) &&
      Number.isFinite(timelineBounds.endX);
    const firstExpectedMs = expectedOnsetsMs[0];
    const earlyVisualWindowMs = Math.max(140, Math.min(260, firstExpectedMs + 120));
    const earlyAnchorX = canUseBounds ? timelineBounds.startX : onsetAnchors[0].x - 34;
    const firstSupportMs = Math.min(0, firstExpectedMs - earlyVisualWindowMs);

    times.push(firstSupportMs);
    positions.push(earlyAnchorX);

    if (canUseBounds && firstExpectedMs > 0 && firstSupportMs !== 0) {
      times.push(0);
      positions.push(timelineBounds.startX);
    }

    for (let idx = 0; idx < count; idx += 1) {
      times.push(expectedOnsetsMs[idx]);
      positions.push(onsetAnchors[idx].x);
    }

    if (
      canUseBounds &&
      Number.isFinite(totalDurationMs) &&
      totalDurationMs > expectedOnsetsMs[count - 1]
    ) {
      times.push(totalDurationMs);
      positions.push(timelineBounds.endX);
    }

    if (times.length === 1) {
      return positions[0];
    }
    if (tapMs <= times[0]) {
      return positions[0];
    }
    if (tapMs >= times[times.length - 1]) {
      return positions[positions.length - 1];
    }

    let low = 0;
    let high = times.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (times[mid] < tapMs) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const rightIndex = Math.max(1, low);
    const leftIndex = rightIndex - 1;
    const startMs = times[leftIndex];
    const endMs = times[rightIndex];
    const startX = positions[leftIndex];
    const endX = positions[rightIndex];
    const spanMs = Math.max(1, endMs - startMs);
    const ratio = (tapMs - startMs) / spanMs;
    return startX + (endX - startX) * ratio;
  }

  function drawNotationAnalysisRowsOnSvg(
    svg,
    onsetAnchors,
    expectedOnsetsMs,
    totalDurationMs,
    timelineBounds,
    analysisRows,
  ) {
    if (
      !Array.isArray(analysisRows) ||
      !analysisRows.length ||
      !onsetAnchors.length ||
      !Array.isArray(expectedOnsetsMs) ||
      !expectedOnsetsMs.length
    ) {
      return;
    }

    if (!svg) {
      return;
    }

    const svgNs = "http://www.w3.org/2000/svg";
    const layer = document.createElementNS(svgNs, "g");
    layer.setAttribute("class", "analysis-dots-layer");
    const width = Number(svg.getAttribute("width")) || svg.clientWidth || 760;
    const minBoundX = 18;
    const maxBoundX = Math.max(minBoundX + 1, width - 18);

    const baseY = Math.max(...onsetAnchors.map((anchor) => anchor.y)) + 24;
    const rowSpacing = 22;

    analysisRows.forEach(function (row, rowIndex) {
      const rowY = baseY + rowIndex * rowSpacing;

      if (row.label) {
        const label = document.createElementNS(svgNs, "text");
        label.setAttribute("x", "10");
        label.setAttribute("y", String(rowY + 3));
        label.setAttribute("font-size", "11");
        label.setAttribute("font-family", "Space Grotesk, sans-serif");
        label.setAttribute("fill", "#345654");
        label.textContent = row.label;
        layer.append(label);
      }

      const tapEvents = Array.isArray(row.tapEvents) ? row.tapEvents : [];
      tapEvents.forEach(function (tapEvent) {
        const mappedX = mapTapMsToAnchorX(
          tapEvent.tapMs,
          expectedOnsetsMs,
          onsetAnchors,
          totalDurationMs,
          timelineBounds,
        );
        if (mappedX === null) {
          return;
        }
        const dot = document.createElementNS(svgNs, "circle");
        dot.setAttribute("cx", String(Math.max(minBoundX, Math.min(maxBoundX, mappedX))));
        dot.setAttribute("cy", String(rowY));
        dot.setAttribute("r", "4.8");
        dot.setAttribute("fill", getAnalysisDotColor(tapEvent.offsetMs));
        dot.setAttribute("stroke", tapEvent.isExtra ? "#16353a" : "#ffffff");
        dot.setAttribute("stroke-width", tapEvent.isExtra ? "1.3" : "0.8");
        dot.setAttribute("opacity", "0.94");
        dot.setAttribute("data-offset-ms", String(tapEvent.offsetMs));
        layer.append(dot);
      });

      const missedExpectedIndices = Array.isArray(row.missedExpectedIndices)
        ? row.missedExpectedIndices
        : [];
      missedExpectedIndices.forEach(function (expectedIndex) {
        const anchor = onsetAnchors[expectedIndex];
        if (!anchor) {
          return;
        }
        const miss = document.createElementNS(svgNs, "text");
        miss.setAttribute("x", String(anchor.x));
        miss.setAttribute("y", String(rowY + 3));
        miss.setAttribute("text-anchor", "middle");
        miss.setAttribute("font-size", "11");
        miss.setAttribute("font-family", "Space Grotesk, sans-serif");
        miss.setAttribute("fill", "#aa2e2e");
        miss.textContent = "X";
        layer.append(miss);
      });
    });

    svg.append(layer);
  }

  function drawNotationAnalysisRows(
    container,
    onsetAnchors,
    expectedOnsetsMs,
    totalDurationMs,
    timelineBounds,
    analysisRows,
  ) {
    const svg = container.querySelector("svg");
    if (!svg) {
      return;
    }
    drawNotationAnalysisRowsOnSvg(
      svg,
      onsetAnchors,
      expectedOnsetsMs,
      totalDurationMs,
      timelineBounds,
      analysisRows,
    );
  }

  function drawExerciseSystem(args) {
    const VF = args.VF;
    const context = args.context;
    const exercise = args.exercise;
    const topY = typeof args.topY === "number" ? args.topY : 34;
    const width = Math.max(760, Number(args.width) || 760);
    const showTimeSignature = args.showTimeSignature !== false;
    const leftPadding = typeof args.leftPadding === "number" ? args.leftPadding : 12;
    const measureGap = typeof args.measureGap === "number" ? args.measureGap : 0;

    const groupedMeasures = splitByMeasure(
      exercise.notes,
      exercise.measuresPerExercise,
      exercise.measureTicks,
    );
    const innerWidth = width - leftPadding * 2;
    const measureWidth =
      (innerWidth - measureGap * (exercise.measuresPerExercise - 1)) / exercise.measuresPerExercise;
    const tiesToDraw = [];
    const onsetAnchors = [];
    let firstStaveLeftX = null;
    let lastStaveRightX = null;

    groupedMeasures.forEach(function (measureTokens, measureIndex) {
      const measureStartTick = measureIndex * exercise.measureTicks;
      const measureEndTick = measureStartTick + exercise.measureTicks;
      const beatBoundaries = getBeatBoundaries(
        measureStartTick,
        exercise.measureTicks,
        exercise.timeSignature,
      );
      const displayTokens = expandMeasureTokensForDisplay(
        measureTokens,
        beatBoundaries,
        measureEndTick,
      );

      const staveX = leftPadding + measureIndex * (measureWidth + measureGap);
      const stave = new VF.Stave(staveX, topY, measureWidth);
      if (firstStaveLeftX === null) {
        firstStaveLeftX = staveX;
      }
      lastStaveRightX = staveX + measureWidth;

      if (measureIndex === 0 && showTimeSignature) {
        stave.addTimeSignature(exercise.timeSignature.num + "/" + exercise.timeSignature.den);
      }

      stave.setContext(context).draw();

      const voice = new VF.Voice({
        num_beats: exercise.timeSignature.num,
        beat_value: exercise.timeSignature.den,
      });

      const noteMap = new Map();

      const notes = displayTokens.map(function (token, displayIndex) {
        const staveNote = new VF.StaveNote({
          clef: "percussion",
          keys: ["c/5"],
          duration: toVexDuration(token),
        });

        applyDotsToNote(VF, staveNote, token.dots || 0);
        noteMap.set(displayIndex, staveNote);
        return staveNote;
      });

      voice.addTickables(notes);
      if (typeof voice.setStave === "function") {
        voice.setStave(stave);
      }
      const formatter = new VF.Formatter().joinVoices([voice]);
      const availableNoteWidth =
        typeof stave.getNoteStartX === "function" && typeof stave.getNoteEndX === "function"
          ? Math.max(1, stave.getNoteEndX() - stave.getNoteStartX())
          : Math.max(40, measureWidth - (measureIndex === 0 && showTimeSignature ? 52 : 24));
      if (typeof formatter.preCalculateMinTotalWidth === "function") {
        formatter.preCalculateMinTotalWidth([voice]);
        const minTotalWidth =
          typeof formatter.getMinTotalWidth === "function" ? formatter.getMinTotalWidth() : null;
        if (Number.isFinite(minTotalWidth) && minTotalWidth > availableNoteWidth + 6) {
          throw new Error(
            "Measure " +
              (measureIndex + 1) +
              " exceeds available notation width (" +
              minTotalWidth.toFixed(1) +
              " > " +
              availableNoteWidth.toFixed(1) +
              ").",
          );
        }
      }
      if (typeof formatter.formatToStave === "function") {
        formatter.formatToStave([voice], stave);
      } else {
        formatter.format([voice], availableNoteWidth);
      }
      const beamGroups = getBeamGroups(VF, exercise.timeSignature);
      const beams = VF.Beam.generateBeams(notes, {
        groups: beamGroups,
        beam_rests: false,
        maintain_stem_directions: true,
      });
      hideFlagsForBeamedNotes(beams);

      voice.draw(context, stave);
      beams.forEach(function (beam) {
        beam.setContext(context).draw();
      });

      displayTokens.forEach(function (token, localIndex) {
        const previousToken = displayTokens[localIndex - 1];
        if (!token.isRest && !(previousToken && previousToken.tieToNext)) {
          const note = noteMap.get(localIndex);
          if (note) {
            const ys = typeof note.getYs === "function" ? note.getYs() : null;
            const y = Array.isArray(ys) ? ys[0] : topY + 56;
            onsetAnchors.push({
              x: note.getAbsoluteX(),
              y: y,
            });
          }
        }

        if (!token.tieToNext) {
          return;
        }
        const next = displayTokens[localIndex + 1];
        if (!next || token.isRest || next.isRest) {
          return;
        }

        const firstNote = noteMap.get(localIndex);
        const lastNote = noteMap.get(localIndex + 1);
        if (!firstNote || !lastNote) {
          return;
        }

        tiesToDraw.push(
          new VF.StaveTie({
            first_note: firstNote,
            last_note: lastNote,
            first_indices: [0],
            last_indices: [0],
          }),
        );
      });
    });

    tiesToDraw.forEach(function (tie) {
      tie.setContext(context).draw();
    });

    return {
      onsetAnchors: onsetAnchors,
      timelineBounds:
        firstStaveLeftX === null || lastStaveRightX === null
          ? null
          : {
              startX: firstStaveLeftX + 8,
              endX: lastStaveRightX - 8,
            },
    };
  }

  function renderNotation(container, exercise, analysisRows) {
    if (!exercise) {
      container.innerHTML = "";
      return NOOP_LIVE_FEEDBACK;
    }

    let VF;
    try {
      VF = assertVexFlow();
    } catch (error) {
      renderFallback(container, error.message);
      return NOOP_LIVE_FEEDBACK;
    }

    container.innerHTML = "";

    const width = Math.max(760, container.clientWidth || 760);
    const rowCount = Array.isArray(analysisRows) ? analysisRows.length : 0;
    const height = 210 + rowCount * 24;
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    const system = drawExerciseSystem({
      VF: VF,
      context: context,
      exercise: exercise,
      topY: 34,
      width: width,
      showTimeSignature: true,
    });
    const liveNoteFeedback = createLiveNoteFeedbackLayer(
      container,
      system.onsetAnchors,
      exercise.expectedOnsetsMs,
      exercise.totalDurationMs,
      system.timelineBounds,
    );
    drawNotationAnalysisRows(
      container,
      system.onsetAnchors,
      exercise.expectedOnsetsMs,
      exercise.totalDurationMs,
      system.timelineBounds,
      analysisRows || [],
    );
    return liveNoteFeedback;
  }

  function Metronome() {
    this.audioContext = null;
    this.toneSynth = null;
    this.isToneReady = false;
    this.soundMode = "click";
  }

  Metronome.prototype.prime = async function () {
    if (typeof window === "undefined") {
      return;
    }

    if (window.Tone) {
      if (!this.toneSynth) {
        const toneContext = window.Tone.getContext ? window.Tone.getContext() : null;
        if (toneContext) {
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
  };

  Metronome.prototype.setSoundMode = function (mode) {
    this.soundMode = mode === "tick" ? "tick" : "click";
  };

  Metronome.prototype.getEstimatedLatencyMs = function () {
    const clamp = function (value) {
      return Math.max(0, Math.min(250, value));
    };

    if (this.isToneReady && window.Tone && window.Tone.getContext) {
      const toneContext = window.Tone.getContext();
      const raw = toneContext && toneContext.rawContext;
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
  };

  Metronome.prototype.getTapAudioContext = function () {
    const toneRaw =
      window.Tone && window.Tone.getContext ? window.Tone.getContext()?.rawContext : null;
    if (toneRaw) {
      return toneRaw;
    }
    return this.audioContext;
  };

  Metronome.prototype.triggerToneToneJs = function (note, durationSeconds) {
    const duration = typeof durationSeconds === "number" ? durationSeconds : 0.02;
    if (!this.isToneReady || !this.toneSynth) {
      return false;
    }
    const immediateTime =
      window.Tone && typeof window.Tone.immediate === "function"
        ? window.Tone.immediate()
        : undefined;
    this.toneSynth.triggerAttackRelease(note, duration, immediateTime);
    return true;
  };

  Metronome.prototype.triggerToneWebAudio = function (args) {
    const context = args.context || this.audioContext;
    if (!context) {
      return false;
    }
    const frequency = args.frequency;
    const accent = !!args.accent;
    const durationSeconds =
      typeof args.durationSeconds === "number" ? args.durationSeconds : 0.018;

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
  };

  Metronome.prototype.tapFeedback = function () {
    const context = this.getTapAudioContext();
    const freq = this.soundMode === "tick" ? 1480 : 1760;
    this.triggerToneWebAudio({
      frequency: freq,
      accent: false,
      durationSeconds: 0.01,
      context: context,
    });
  };

  Metronome.prototype.tick = function (accent) {
    const isAccent = !!accent;
    const note = this.soundMode === "tick" ? (isAccent ? "G6" : "D6") : isAccent ? "F6" : "C6";
    if (this.triggerToneToneJs(note, 0.02)) {
      return;
    }

    const freq =
      this.soundMode === "tick" ? (isAccent ? 1960 : 1480) : isAccent ? 1760 : 1320;
    this.triggerToneWebAudio({
      frequency: freq,
      accent: isAccent,
      durationSeconds: 0.015,
    });
  };

  function TimingEngine(args) {
    this.metronome = args.metronome;
    this.state = "idle";
    this.session = null;
    this.timeouts = new Set();
  }

  TimingEngine.prototype.isTapWindowOpen = function () {
    return this.state === "performing";
  };

  TimingEngine.prototype.shouldTrapSpacebar = function () {
    return this.state === "count-in" || this.state === "performing";
  };

  TimingEngine.prototype.clearTimers = function () {
    for (const timeoutId of this.timeouts) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();
  };

  TimingEngine.prototype.stop = function () {
    this.clearTimers();
    this.state = "idle";
    this.session = null;
  };

  TimingEngine.prototype.cancel = function (reason) {
    const cancelReason = reason || "user";
    if (!this.session || (this.state !== "count-in" && this.state !== "performing")) {
      return false;
    }

    const snapshot = this.session.loopTapsMs.map(function (loopTaps) {
      return loopTaps.slice();
    });
    const onStateChange = this.session.onStateChange;
    const onCancel = this.session.onCancel;
    const phase = this.state;

    this.clearTimers();
    this.state = "cancelled";
    onStateChange(this.state);
    this.stop();
    onCancel({ loopTapsMs: snapshot, phase: phase, reason: cancelReason });
    return true;
  };

  TimingEngine.prototype.schedule = function (msFromNow, fn) {
    const timeoutId = setTimeout(() => {
      this.timeouts.delete(timeoutId);
      fn();
    }, Math.max(0, msFromNow));
    this.timeouts.add(timeoutId);
  };

  TimingEngine.prototype.start = async function (args) {
    this.stop();
    await this.metronome.prime();

    const exercise = args.exercise;
    const loops = args.loops || 1;
    const latencyCompensationMs = Math.max(0, args.latencyCompensationMs || 0);
    const onStateChange = args.onStateChange || function () {};
    const onBeat = args.onBeat || function () {};
    const onLoopStart = args.onLoopStart || function () {};
    const onTap = args.onTap || function () {};
    const onComplete = args.onComplete || function () {};
    const onCancel = args.onCancel || function () {};

    const beatsPerMeasure = exercise.timeSignature.num;
    const beatMs = (60000 / exercise.tempoBpm) * (4 / exercise.timeSignature.den);
    const countInMs = beatsPerMeasure * beatMs;
    const singleLoopMs = exercise.totalDurationMs;
    const performanceMs = singleLoopMs * loops;
    const totalMs = countInMs + performanceMs;

    this.session = {
      loopTapsMs: Array.from({ length: loops }, function () {
        return [];
      }),
      loops: loops,
      singleLoopMs: singleLoopMs,
      latencyCompensationMs: latencyCompensationMs,
      firstExpectedOnsetMs: Math.max(0, (exercise.expectedOnsetsMs && exercise.expectedOnsetsMs[0]) || 0),
      loopBoundaryShiftWindowMs: 0,
      performanceStart: null,
      performanceEnd: null,
      totalTapCount: 0,
      onTap: onTap,
      onCancel: onCancel,
      onStateChange: onStateChange,
    };
    this.session.loopBoundaryShiftWindowMs = Math.max(
      140,
      Math.min(260, this.session.firstExpectedOnsetMs + 110),
    );

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
          phase: phase,
          beatInMeasure: beatInMeasure,
          beatNumber: beatIndex + 1,
          loops: loops,
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
  };

  TimingEngine.prototype.registerTap = function (now) {
    const tapTime = typeof now === "number" ? now : performance.now();
    if (!this.session || this.state !== "performing" || this.session.performanceStart === null) {
      return false;
    }
    if (tapTime < this.session.performanceStart || tapTime > this.session.performanceEnd) {
      return false;
    }

    const elapsedSincePerfStart = tapTime - this.session.performanceStart;
    let loopIndex = Math.min(
      this.session.loops - 1,
      Math.floor(elapsedSincePerfStart / this.session.singleLoopMs),
    );
    const withinLoopMs = elapsedSincePerfStart - loopIndex * this.session.singleLoopMs;
    let compensatedTapMs = Math.round(withinLoopMs - this.session.latencyCompensationMs);

    if (
      loopIndex < this.session.loops - 1 &&
      compensatedTapMs >= this.session.singleLoopMs - this.session.loopBoundaryShiftWindowMs
    ) {
      loopIndex += 1;
      compensatedTapMs -= this.session.singleLoopMs;
    }
    this.session.loopTapsMs[loopIndex].push(compensatedTapMs);
    this.session.totalTapCount += 1;
    this.session.onTap({
      loop: loopIndex + 1,
      loopIndex: loopIndex,
      withinLoopMs: compensatedTapMs,
      tapIndexInLoop: this.session.loopTapsMs[loopIndex].length,
      totalTapCount: this.session.totalTapCount,
    });
    return true;
  };

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
    toggleLogBtn: document.getElementById("toggleLogBtn"),
    sessionLogPanel: document.getElementById("sessionLogPanel"),
    clearLogBtn: document.getElementById("clearLogBtn"),
    sessionLogBody: document.getElementById("sessionLogBody"),
    sessionLogEmpty: document.getElementById("sessionLogEmpty"),
    arcadeScoreValue: document.getElementById("arcadeScoreValue"),
    arcadeLevelValue: document.getElementById("arcadeLevelValue"),
    arcadeHighScoreValue: document.getElementById("arcadeHighScoreValue"),
    arcadeComboValue: document.getElementById("arcadeComboValue"),
    arcadeStreakValue: document.getElementById("arcadeStreakValue"),
    arcadeMultiplierValue: document.getElementById("arcadeMultiplierValue"),
    arcadeRankValue: document.getElementById("arcadeRankValue"),
    arcadeSetChainValue: document.getElementById("arcadeSetChainValue"),
    arcadeLivesValue: document.getElementById("arcadeLivesValue"),
    arcadeHealthFill: document.getElementById("arcadeHealthFill"),
    arcadeHealthValue: document.getElementById("arcadeHealthValue"),
    arcadeHypeFill: document.getElementById("arcadeHypeFill"),
    arcadeHypeValue: document.getElementById("arcadeHypeValue"),
    arcadeBanner: document.getElementById("arcadeBanner"),
    arcadeFxLayer: document.getElementById("arcadeFxLayer"),
    notationPanel: document.getElementById("notationPanel"),
    resultsPanel: document.getElementById("resultsPanel"),
    appShell: document.querySelector(".app-shell"),
    arcadeOverlay: document.getElementById("arcadeOverlay"),
    overlayEyebrow: document.getElementById("overlayEyebrow"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayLevelGroup: document.getElementById("overlayLevelGroup"),
    overlayTempoGroup: document.getElementById("overlayTempoGroup"),
    overlayPrimaryBtn: document.getElementById("overlayPrimaryBtn"),
    startLevelSelect: document.getElementById("startLevelSelect"),
    overlayTempoSlider: document.getElementById("overlayTempoSlider"),
    overlayTempoInput: document.getElementById("overlayTempoInput"),
    gameOverModal: document.getElementById("gameOverModal"),
    gameOverTitle: document.getElementById("gameOverTitle"),
    gameOverScoreValue: document.getElementById("gameOverScoreValue"),
    gameOverRhythmsValue: document.getElementById("gameOverRhythmsValue"),
    gameOverPeakLevelValue: document.getElementById("gameOverPeakLevelValue"),
    gameOverBestComboValue: document.getElementById("gameOverBestComboValue"),
    gameOverBestChainValue: document.getElementById("gameOverBestChainValue"),
    playAgainBtn: document.getElementById("playAgainBtn"),
  };

  const metronome = new Metronome();
  const timingEngine = new TimingEngine({ metronome: metronome });
  const ARCADE_STORAGE_KEY = "rhythm-sightreader-arcade-best-score";

  const appState = {
    exercise: null,
    loopTapSets: [],
    loopResults: [],
    selectedTempoBpm: null,
    isSessionActive: false,
    isSpaceHeld: false,
    sessionLogEntries: [],
    nextAttemptNumber: 1,
    isLogOpen: false,
    rhythmIdCounter: 0,
    currentRhythmId: 0,
    lastSessionLoops: 1,
    arcade: {
      score: 0,
      combo: 0,
      streak: 0,
      bestStreak: 0,
      multiplier: 1,
      health: 100,
      hype: 0,
      rank: "C",
      bestScore: 0,
      perfectHits: 0,
      greatHits: 0,
      goodHits: 0,
      badHits: 0,
      missHits: 0,
      extraHits: 0,
      rhythmSetChain: 0,
      bestRhythmSetChain: 0,
      lastQualifiedRhythmId: null,
      maxLives: 3,
      lives: 3,
      gameOver: false,
      runState: "title",
      selectedStartLevel: 1,
      currentLevel: 1,
      peakLevel: 1,
      strongClearStreak: 0,
      rhythmsCleared: 0,
      lastClearAccuracy: 0,
      fixedTempoBpm: null,
      currentTimeSignature: null,
      measuresPerLine: 4,
      lines: [],
      activeLineIndex: 0,
      streamPhase: "idle",
      streamTimers: new Set(),
      activeLineSession: null,
      activeLiveFeedback: NOOP_LIVE_FEEDBACK,
      latencyCompensationMs: 0,
      scrollMetrics: null,
      diagnostics: [],
      lastGameOverSummary: null,
    },
  };

  function clampTempo(value) {
    return Math.max(40, Math.min(220, Number(value) || 90));
  }

  function syncTempoControls(bpm) {
    const clamped = clampTempo(bpm);
    if (ui.tempoSlider) {
      ui.tempoSlider.value = String(clamped);
    }
    if (ui.tempoInput) {
      ui.tempoInput.value = String(clamped);
    }
    if (ui.overlayTempoSlider) {
      ui.overlayTempoSlider.value = String(clamped);
    }
    if (ui.overlayTempoInput) {
      ui.overlayTempoInput.value = String(clamped);
    }
    ui.tempoValue.textContent = String(clamped);
  }

  function setStatus(text) {
    ui.statusValue.textContent = text;
  }

  function setTapStatus(text) {
    ui.tapStatus.textContent = text;
  }

  function summarizeExerciseForDiagnostics(exercise) {
    if (!exercise) {
      return null;
    }

    return {
      level: exercise.level,
      timeSignature: exercise.timeSignature
        ? exercise.timeSignature.num + "/" + exercise.timeSignature.den
        : null,
      tempoBpm: exercise.tempoBpm,
      measuresPerExercise: exercise.measuresPerExercise,
      noteCount: Array.isArray(exercise.notes) ? exercise.notes.length : 0,
      expectedOnsets: Array.isArray(exercise.expectedOnsetsMs) ? exercise.expectedOnsetsMs.length : 0,
    };
  }

  function summarizeQueuedArcadeLines(limit) {
    const safeLimit = Math.max(1, Number(limit) || 4);
    return appState.arcade.lines.slice(0, safeLimit).map(function (line, index) {
      return {
        queueIndex: index,
        id: line.id,
        exercise: summarizeExerciseForDiagnostics(line.exercise),
      };
    });
  }

  function recordArcadeDiagnostic(type, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: type,
      details: details || {},
    };
    appState.arcade.diagnostics.push(entry);
    if (appState.arcade.diagnostics.length > 40) {
      appState.arcade.diagnostics.shift();
    }
    if (typeof window !== "undefined") {
      window.__rhythmDiagnostics = appState.arcade.diagnostics.slice();
    }
    if (typeof console !== "undefined" && console.error) {
      console.error("[RhythmDiagnostics]", entry);
    }
  }

  function handleArcadeRuntimeError(error, context) {
    const runtimeError =
      error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown runtime error.");

    recordArcadeDiagnostic("runtime-error", {
      context: context || null,
      error: runtimeError.message,
      stack: runtimeError.stack || null,
      runState: appState.arcade.runState,
      streamPhase: appState.arcade.streamPhase,
      activeLine: summarizeExerciseForDiagnostics(getActiveArcadeLine()?.exercise || null),
      queuedLines: summarizeQueuedArcadeLines(4),
    });

    if (
      appState.isSessionActive ||
      appState.arcade.runState === "active" ||
      appState.arcade.runState === "paused"
    ) {
      pauseArcadeForRenderFailure(
        "The stream hit an internal error and was paused. Press Return to regenerate the current line.",
      );
      return;
    }

    setStatus("Error");
    setBeatIndicator(false, "Error");
    setTapStatus("System error: " + runtimeError.message);
    setArcadeBanner("SYSTEM ERROR", "bad");
  }

  function setButtonsDisabled(disabled) {
    ui.generateBtn.disabled = disabled;
    ui.startBtn.disabled = disabled;
    ui.loopBtn.disabled = disabled;
    ui.levelSelect.disabled = disabled;
    if (ui.tempoSlider) {
      ui.tempoSlider.disabled = disabled;
    }
    if (ui.tempoInput) {
      ui.tempoInput.disabled = disabled;
    }
    if (ui.clickSoundSelect) {
      ui.clickSoundSelect.disabled = disabled;
    }
    ui.cancelBtn.disabled = !disabled;
  }

  function setPostRunActionsMode(mode) {
    if (!ui.postRunActions) {
      return;
    }
    const safeMode = mode || "hidden";
    const show = safeMode !== "hidden";
    const isGameOver = safeMode === "gameover";

    ui.postRunActions.hidden = !show;
    ui.postRunActions.setAttribute("data-mode", safeMode);

    if (ui.nextRhythmBtn) {
      ui.nextRhythmBtn.hidden = isGameOver;
    }
    if (ui.retryRhythmBtn) {
      ui.retryRhythmBtn.hidden = isGameOver;
    }
    if (ui.restartArcadeBtn) {
      ui.restartArcadeBtn.hidden = !isGameOver;
    }

    if (!show) {
      return;
    }

    const preferredButton = isGameOver ? ui.restartArcadeBtn : ui.nextRhythmBtn;
    if (preferredButton && !preferredButton.hidden) {
      preferredButton.focus();
    }
  }

  function setBeatIndicator(active, label) {
    ui.beatIndicator.classList.toggle("active", !!active);
    ui.beatText.textContent = label;
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function safeGetArcadeBestScore() {
    try {
      const raw = window.localStorage.getItem(ARCADE_STORAGE_KEY);
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      return Math.max(0, Math.round(numeric));
    } catch (error) {
      return 0;
    }
  }

  function safeStoreArcadeBestScore(score) {
    try {
      window.localStorage.setItem(ARCADE_STORAGE_KEY, String(Math.max(0, Math.round(score))));
    } catch (error) {
      // Ignore storage errors in restrictive browser contexts.
    }
  }

  function formatArcadeScore(score) {
    return Math.max(0, Math.round(score)).toLocaleString();
  }

  function comboMultiplierFromCount(comboCount) {
    if (comboCount >= 24) {
      return 4;
    }
    if (comboCount >= 14) {
      return 3;
    }
    if (comboCount >= 7) {
      return 2;
    }
    return 1;
  }

  function liveRankFromArcadeState(arcade) {
    const comboPressure = Math.min(100, arcade.combo * 4.8);
    const weighted = arcade.hype * 0.48 + arcade.health * 0.34 + comboPressure * 0.18;

    if (weighted >= 94 && arcade.combo >= 16) {
      return "S";
    }
    if (weighted >= 84) {
      return "A";
    }
    if (weighted >= 72) {
      return "B";
    }
    if (weighted >= 58) {
      return "C";
    }
    return "D";
  }

  function finalRankFromResult(accuracy, missedCount, extraCount) {
    if (accuracy >= 98 && missedCount === 0 && extraCount === 0) {
      return "SS";
    }
    if (accuracy >= 93 && missedCount <= 1 && extraCount <= 1) {
      return "S";
    }
    if (accuracy >= 85) {
      return "A";
    }
    if (accuracy >= 75) {
      return "B";
    }
    if (accuracy >= 60) {
      return "C";
    }
    return "D";
  }

  function setArcadeBanner(text, tone) {
    if (!ui.arcadeBanner) {
      return;
    }
    const bannerTone = tone || "neutral";
    ui.arcadeBanner.textContent = text;
    ui.arcadeBanner.classList.remove(
      "banner-neutral",
      "banner-good",
      "banner-boost",
      "banner-bad",
    );
    ui.arcadeBanner.classList.add("banner-" + bannerTone);
  }

  function pulseArcadeShellClass(className, durationMs) {
    if (!ui.appShell) {
      return;
    }
    const duration = typeof durationMs === "number" ? durationMs : 320;
    ui.appShell.classList.remove(className);
    void ui.appShell.offsetWidth;
    ui.appShell.classList.add(className);
    setTimeout(function () {
      ui.appShell.classList.remove(className);
    }, duration);
  }

  function setArcadeDangerMode(active) {
    if (ui.notationPanel) {
      ui.notationPanel.classList.toggle("danger", !!active);
    }
    if (ui.resultsPanel) {
      ui.resultsPanel.classList.toggle("danger", !!active);
    }
  }

  function clearArcadeFx() {
    if (!ui.arcadeFxLayer) {
      return;
    }
    ui.arcadeFxLayer.innerHTML = "";
  }

  function spawnArcadeFloat(text, tone, size) {
    if (!ui.arcadeFxLayer) {
      return;
    }
    const float = document.createElement("span");
    const colorTone = tone || "good";
    const sizeClass = size || "md";
    float.className = "arcade-float tone-" + colorTone + " size-" + sizeClass;
    float.textContent = text;
    float.style.left = (18 + Math.random() * 64).toFixed(2) + "%";
    float.style.top = (34 + Math.random() * 30).toFixed(2) + "%";
    float.style.setProperty("--drift-x", (Math.random() * 28 - 14).toFixed(1) + "px");
    ui.arcadeFxLayer.append(float);
    setTimeout(function () {
      float.remove();
    }, 1040);
  }

  function updateArcadeHud() {
    const arcade = appState.arcade;
    const safeHealth = clampPercent(arcade.health);
    const safeHype = clampPercent(arcade.hype);
    const rank = arcade.rank || "C";

    if (ui.arcadeScoreValue) {
      ui.arcadeScoreValue.textContent = formatArcadeScore(arcade.score);
    }
    if (ui.arcadeLevelValue) {
      ui.arcadeLevelValue.textContent = "L" + arcade.currentLevel;
    }
    if (ui.arcadeHighScoreValue) {
      ui.arcadeHighScoreValue.textContent = formatArcadeScore(arcade.bestScore);
    }
    if (ui.arcadeComboValue) {
      ui.arcadeComboValue.textContent = "x" + arcade.combo;
    }
    if (ui.arcadeStreakValue) {
      ui.arcadeStreakValue.textContent = String(arcade.streak);
    }
    if (ui.arcadeMultiplierValue) {
      ui.arcadeMultiplierValue.textContent = "x" + arcade.multiplier;
    }
    if (ui.arcadeRankValue) {
      ui.arcadeRankValue.textContent = rank;
      ui.arcadeRankValue.setAttribute("data-rank", rank);
    }
    if (ui.arcadeSetChainValue) {
      ui.arcadeSetChainValue.textContent = "x" + arcade.rhythmSetChain;
    }
    if (ui.arcadeLivesValue) {
      ui.arcadeLivesValue.textContent = String(Math.max(0, arcade.lives));
      ui.arcadeLivesValue.setAttribute("data-empty", arcade.lives <= 0 ? "true" : "false");
    }
    if (ui.arcadeHealthFill) {
      ui.arcadeHealthFill.style.width = safeHealth + "%";
    }
    if (ui.arcadeHealthValue) {
      ui.arcadeHealthValue.textContent = safeHealth + "%";
    }
    if (ui.arcadeHypeFill) {
      ui.arcadeHypeFill.style.width = safeHype + "%";
    }
    if (ui.arcadeHypeValue) {
      ui.arcadeHypeValue.textContent = safeHype + "%";
    }
    if (ui.appShell) {
      ui.appShell.classList.toggle("game-over", !!arcade.gameOver);
    }
  }

  function resetArcadeProfileState() {
    appState.arcade.streamTimers.forEach(function (timeoutId) {
      clearTimeout(timeoutId);
    });
    appState.arcade.streamTimers.clear();
    appState.arcade.score = 0;
    appState.arcade.combo = 0;
    appState.arcade.streak = 0;
    appState.arcade.bestStreak = 0;
    appState.arcade.multiplier = 1;
    appState.arcade.health = 100;
    appState.arcade.hype = 0;
    appState.arcade.rank = "C";
    appState.arcade.perfectHits = 0;
    appState.arcade.greatHits = 0;
    appState.arcade.goodHits = 0;
    appState.arcade.badHits = 0;
    appState.arcade.missHits = 0;
    appState.arcade.extraHits = 0;
    appState.arcade.rhythmSetChain = 0;
    appState.arcade.bestRhythmSetChain = 0;
    appState.arcade.lastQualifiedRhythmId = null;
    appState.arcade.lives = appState.arcade.maxLives;
    appState.arcade.gameOver = false;
    appState.arcade.runState = "title";
    appState.arcade.selectedStartLevel = Number(ui.startLevelSelect?.value || ui.levelSelect?.value || 1);
    appState.arcade.currentLevel = appState.arcade.selectedStartLevel;
    appState.arcade.peakLevel = appState.arcade.selectedStartLevel;
    appState.arcade.strongClearStreak = 0;
    appState.arcade.rhythmsCleared = 0;
    appState.arcade.lastClearAccuracy = 0;
    appState.arcade.fixedTempoBpm = null;
    appState.arcade.currentTimeSignature = null;
    appState.arcade.measuresPerLine = 4;
    appState.arcade.lines = [];
    appState.arcade.activeLineIndex = 0;
    appState.arcade.streamPhase = "idle";
    appState.arcade.activeLineSession = null;
    appState.arcade.activeLiveFeedback = NOOP_LIVE_FEEDBACK;
    appState.arcade.latencyCompensationMs = 0;
    appState.arcade.scrollMetrics = null;
    appState.arcade.diagnostics = [];
    appState.arcade.lastGameOverSummary = null;
    clearArcadeFx();
    setArcadeDangerMode(false);
    setArcadeBanner("READY PLAYER ONE", "neutral");
    updateArcadeHud();
  }

  function prepareArcadeRunState() {
    appState.arcade.perfectHits = 0;
    appState.arcade.greatHits = 0;
    appState.arcade.goodHits = 0;
    appState.arcade.badHits = 0;
    appState.arcade.missHits = 0;
    appState.arcade.extraHits = 0;
    clearArcadeFx();
    setArcadeDangerMode(appState.arcade.health <= 26);
    updateArcadeHud();
  }

  function triggerArcadeGameOver() {
    const arcade = appState.arcade;
    if (arcade.gameOver) {
      return;
    }

    arcade.gameOver = true;
    arcade.lives = 0;
    arcade.health = 0;
    arcade.combo = 0;
    arcade.streak = 0;
    arcade.multiplier = 1;
    arcade.rank = "D";
    setArcadeDangerMode(true);
    setArcadeBanner("GAME OVER! PRESS RESTART", "bad");
    spawnArcadeFloat("GAME OVER", "bad", "lg");
    pulseArcadeShellClass("arcade-punish", 520);
    updateArcadeHud();

    if (appState.isSessionActive) {
      cancelArcadeStream("game-over");
    }
  }

  function applyShieldHeal(amount) {
    const arcade = appState.arcade;
    if (arcade.gameOver) {
      return;
    }
    arcade.health = clampPercent(arcade.health + amount);
  }

  function applyShieldDamage(amount) {
    const arcade = appState.arcade;
    if (arcade.gameOver) {
      return { lifeLost: false, gameOver: true };
    }

    arcade.health -= amount;
    let lifeLost = false;
    while (arcade.health <= 0 && !arcade.gameOver) {
      arcade.lives -= 1;
      lifeLost = true;
      if (arcade.lives > 0) {
        arcade.health += 100;
        spawnArcadeFloat("SHIELD BREAK", "bad", "md");
        spawnArcadeFloat("LIFE LOST", "bad", "lg");
        setArcadeBanner("SHIELD BROKEN! " + arcade.lives + " LIVES LEFT", "bad");
        if (appState.isSessionActive) {
          cancelArcadeStream("life-lost");
        }
      } else {
        triggerArcadeGameOver();
      }
    }

    if (!arcade.gameOver) {
      arcade.health = clampPercent(Math.max(0, arcade.health));
    }
    return { lifeLost: lifeLost, gameOver: arcade.gameOver };
  }

  function registerArcadeHit(offsetMs) {
    const arcade = appState.arcade;
    if (arcade.gameOver) {
      return;
    }

    const abs = Math.abs(offsetMs);
    let label = "GOOD";
    let tone = "good";
    let basePoints = 130;
    let healthDelta = 1;
    let hypeDelta = 6;
    let isComboBreak = false;

    if (abs <= 30) {
      label = "PERFECT";
      tone = "boost";
      basePoints = 320;
      healthDelta = 3;
      hypeDelta = 13;
      arcade.perfectHits += 1;
    } else if (abs <= 60) {
      label = "GREAT";
      tone = "good";
      basePoints = 220;
      healthDelta = 2;
      hypeDelta = 10;
      arcade.greatHits += 1;
    } else if (abs <= 100) {
      label = "GOOD";
      tone = "good";
      basePoints = 130;
      healthDelta = 1;
      hypeDelta = 6;
      arcade.goodHits += 1;
    } else {
      label = "OFFBEAT";
      tone = "bad";
      isComboBreak = true;
      arcade.badHits += 1;
    }

    if (isComboBreak) {
      arcade.combo = 0;
      arcade.streak = 0;
      arcade.multiplier = 1;
      arcade.score = Math.max(0, arcade.score - 90);
      arcade.hype = clampPercent(arcade.hype - 14);
      const shieldState = applyShieldDamage(10);
      if (shieldState.gameOver) {
        return;
      }
      if (!shieldState.lifeLost) {
        setArcadeBanner("OFFBEAT! COMBO LOST", "bad");
      }
      spawnArcadeFloat(label, "bad", "md");
      pulseArcadeShellClass("arcade-punish", 380);
    } else {
      arcade.combo += 1;
      arcade.streak += 1;
      arcade.bestStreak = Math.max(arcade.bestStreak, arcade.streak);
      arcade.multiplier = comboMultiplierFromCount(arcade.combo);
      const points = Math.round(basePoints * arcade.multiplier);
      arcade.score += points;
      applyShieldHeal(healthDelta);
      arcade.hype = clampPercent(arcade.hype + hypeDelta);

      if (arcade.combo > 0 && arcade.combo % 8 === 0) {
        setArcadeBanner("COMBO x" + arcade.combo + "!", "boost");
        spawnArcadeFloat("COMBO x" + arcade.combo, "boost", "lg");
      } else {
        setArcadeBanner(label + " +" + points, tone);
        spawnArcadeFloat(label, tone, abs <= 30 ? "lg" : "md");
      }
      pulseArcadeShellClass("arcade-reward", abs <= 30 ? 380 : 240);
    }

    arcade.rank = liveRankFromArcadeState(arcade);
    setArcadeDangerMode(arcade.health <= 26);
    updateArcadeHud();
  }

  function registerArcadeExtraTap(offsetMs) {
    const arcade = appState.arcade;
    if (arcade.gameOver) {
      return;
    }

    const offsetLabel = timingWordsFromOffset(offsetMs).replace(" ms", "");
    arcade.extraHits += 1;
    arcade.combo = 0;
    arcade.streak = 0;
    arcade.multiplier = 1;
    arcade.score = Math.max(0, arcade.score - 140);
    arcade.hype = clampPercent(arcade.hype - 18);
    const shieldState = applyShieldDamage(14);
    if (shieldState.gameOver) {
      return;
    }
    arcade.rank = liveRankFromArcadeState(arcade);

    if (!shieldState.lifeLost) {
      setArcadeBanner("EXTRA TAP! " + offsetLabel, "bad");
    }
    spawnArcadeFloat("EXTRA", "bad", "md");
    pulseArcadeShellClass("arcade-punish", 420);
    setArcadeDangerMode(arcade.health <= 26);
    updateArcadeHud();
  }

  function registerArcadeMiss() {
    const arcade = appState.arcade;
    if (arcade.gameOver) {
      return;
    }

    arcade.missHits += 1;
    arcade.combo = 0;
    arcade.streak = 0;
    arcade.multiplier = 1;
    arcade.score = Math.max(0, arcade.score - 180);
    arcade.hype = clampPercent(arcade.hype - 21);
    const shieldState = applyShieldDamage(18);
    if (shieldState.gameOver) {
      return;
    }
    arcade.rank = liveRankFromArcadeState(arcade);

    if (!shieldState.lifeLost) {
      setArcadeBanner("MISS! STREAK RESET", "bad");
    }
    spawnArcadeFloat("MISS", "bad", "lg");
    pulseArcadeShellClass("arcade-punish", 460);
    setArcadeDangerMode(arcade.health <= 26);
    updateArcadeHud();
  }

  function finalizeArcadeSession(summary) {
    const accuracy = Math.max(0, Math.min(100, Number(summary.accuracy) || 0));
    const missedCount = Math.max(0, Number(summary.missed) || 0);
    const extraCount = Math.max(0, Number(summary.extra) || 0);
    const rhythmId = Number(summary.rhythmId) || 0;
    const arcade = appState.arcade;

    const precisionBonus = Math.round(Math.max(0, accuracy - 65) * 20);
    const survivalBonus = Math.round(clampPercent(arcade.health) * 6);
    const cleanBonus = missedCount === 0 && extraCount === 0 ? 750 : 0;
    const isStrongClear = accuracy >= 86 && missedCount <= 1 && extraCount <= 1;
    let rhythmChainBonus = 0;
    let chainIncreased = false;

    if (isStrongClear) {
      if (rhythmId > 0 && rhythmId !== arcade.lastQualifiedRhythmId) {
        arcade.rhythmSetChain += 1;
        arcade.bestRhythmSetChain = Math.max(arcade.bestRhythmSetChain, arcade.rhythmSetChain);
        arcade.lastQualifiedRhythmId = rhythmId;
        chainIncreased = true;
        rhythmChainBonus = Math.round(Math.max(1, arcade.rhythmSetChain) ** 2 * 180);
      } else {
        rhythmChainBonus = Math.round(Math.max(1, arcade.rhythmSetChain) * 75);
      }
    } else {
      arcade.rhythmSetChain = 0;
      if (accuracy < 70 || missedCount + extraCount >= 3) {
        arcade.lastQualifiedRhythmId = null;
      }
    }

    arcade.score = Math.max(0, arcade.score + precisionBonus + survivalBonus + cleanBonus + rhythmChainBonus);
    arcade.hype = clampPercent(arcade.hype + Math.round(accuracy / 8));
    arcade.rank = finalRankFromResult(accuracy, missedCount, extraCount);

    const wasHighScore = arcade.score > arcade.bestScore;
    if (wasHighScore) {
      arcade.bestScore = arcade.score;
      safeStoreArcadeBestScore(arcade.bestScore);
    }

    const rankTone = arcade.rank === "SS" || arcade.rank === "S" ? "boost" : arcade.rank === "A" || arcade.rank === "B" ? "good" : "bad";
    if (wasHighScore) {
      setArcadeBanner("NEW HIGH SCORE!", "boost");
      spawnArcadeFloat("NEW BEST " + formatArcadeScore(arcade.bestScore), "boost", "lg");
    } else if (chainIncreased && arcade.rhythmSetChain >= 2) {
      setArcadeBanner("RHYTHM CHAIN x" + arcade.rhythmSetChain, "boost");
    } else {
      setArcadeBanner("RANK " + arcade.rank + " CLEAR", rankTone);
    }
    spawnArcadeFloat("RANK " + arcade.rank, rankTone, "lg");
    if (chainIncreased && arcade.rhythmSetChain >= 2) {
      spawnArcadeFloat("CHAIN BONUS +" + formatArcadeScore(rhythmChainBonus), "boost", "md");
    }
    if (cleanBonus > 0) {
      spawnArcadeFloat("FULL COMBO BONUS", "boost", "md");
    }
    pulseArcadeShellClass(
      arcade.rank === "SS" || arcade.rank === "S" ? "arcade-mega" : "arcade-reward",
      520,
    );
    updateArcadeHud();

    return {
      rank: arcade.rank,
      finalScore: arcade.score,
      bestStreak: arcade.bestStreak,
      wasHighScore: wasHighScore,
      highScore: arcade.bestScore,
      rhythmSetChain: arcade.rhythmSetChain,
      chainBonus: rhythmChainBonus,
    };
  }

  function appendArcadeSummaryCards(summaryCardsEl, arcadeSummary) {
    if (!summaryCardsEl) {
      return;
    }

    const cards = [
      { label: "Arcade Rank", value: arcadeSummary.rank },
      { label: "Final Score", value: formatArcadeScore(arcadeSummary.finalScore) },
      { label: "Best Streak", value: String(arcadeSummary.bestStreak) },
      { label: "Set Chain", value: "x" + arcadeSummary.rhythmSetChain },
      {
        label: "High Score",
        value: formatArcadeScore(arcadeSummary.highScore) + (arcadeSummary.wasHighScore ? " NEW!" : ""),
      },
    ];

    cards.forEach(function (card) {
      const block = document.createElement("article");
      block.className = "summary-card arcade-summary-card";
      if (card.label === "Arcade Rank") {
        block.setAttribute("data-rank", card.value);
      }
      block.innerHTML = "<h3>" + card.label + "</h3><strong>" + card.value + "</strong>";
      summaryCardsEl.append(block);
    });
  }

  function formatSessionLogTime(timestampMs) {
    return new Date(timestampMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatSessionLogAccuracy(accuracy) {
    return typeof accuracy === "number" ? accuracy + "%" : "-";
  }

  function formatSessionLogCount(value) {
    return typeof value === "number" ? String(value) : "-";
  }

  function refreshSessionLogVisibility() {
    if (!ui.sessionLogBody || !ui.sessionLogEmpty) {
      return;
    }
    const hasEntries = appState.sessionLogEntries.length > 0;
    ui.sessionLogEmpty.hidden = hasEntries;
    const tableWrap = ui.sessionLogBody.closest(".table-wrap");
    if (tableWrap) {
      tableWrap.hidden = !hasEntries;
    }
  }

  function updateSessionLogToggleLabel() {
    if (!ui.toggleLogBtn) {
      return;
    }
    const prefix = appState.isLogOpen ? "Hide" : "Show";
    ui.toggleLogBtn.textContent = prefix + " Session Log (" + appState.sessionLogEntries.length + ")";
  }

  function setSessionLogOpen(open) {
    if (!ui.toggleLogBtn || !ui.sessionLogPanel) {
      return;
    }
    appState.isLogOpen = !!open;
    ui.sessionLogPanel.hidden = !appState.isLogOpen;
    ui.toggleLogBtn.setAttribute("aria-expanded", String(appState.isLogOpen));
    updateSessionLogToggleLabel();
  }

  function buildSessionLogRow(entry) {
    const row = document.createElement("tr");

    const addTextCell = function (value) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    };

    addTextCell(String(entry.attemptNumber));
    addTextCell(formatSessionLogTime(entry.timestampMs));
    addTextCell("Level " + entry.level);
    addTextCell(entry.modeLabel);
    addTextCell(entry.tempoBpm + " BPM");
    addTextCell(formatSessionLogAccuracy(entry.accuracy));
    addTextCell(formatSessionLogCount(entry.taps));
    addTextCell(formatSessionLogCount(entry.missed));
    addTextCell(formatSessionLogCount(entry.extra));

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    statusBadge.className = "session-log-status " + entry.statusClass;
    statusBadge.textContent = entry.statusLabel;
    statusCell.append(statusBadge);
    row.append(statusCell);

    return row;
  }

  function appendSessionLogEntry(entry) {
    if (!ui.sessionLogBody) {
      return;
    }
    appState.sessionLogEntries.push(entry);
    ui.sessionLogBody.append(buildSessionLogRow(entry));
    refreshSessionLogVisibility();
    updateSessionLogToggleLabel();
  }

  function addSessionLogEntry(args) {
    const labelsByStatus = {
      completed: "Completed",
      cancelled: "Cancelled",
      error: "Error",
    };
    const statusClass = Object.hasOwn(labelsByStatus, args.status) ? args.status : "completed";
    appendSessionLogEntry({
      attemptNumber: args.attemptNumber,
      timestampMs: Date.now(),
      level: args.level,
      modeLabel: args.loops === 1 ? "Single" : "Loop x" + args.loops,
      tempoBpm: args.tempoBpm,
      accuracy: typeof args.accuracy === "number" ? args.accuracy : null,
      taps: typeof args.taps === "number" ? args.taps : null,
      missed: typeof args.missed === "number" ? args.missed : null,
      extra: typeof args.extra === "number" ? args.extra : null,
      statusClass: statusClass,
      statusLabel: labelsByStatus[statusClass],
    });
  }

  function clearSessionLog() {
    appState.sessionLogEntries = [];
    appState.nextAttemptNumber = 1;
    if (ui.sessionLogBody) {
      ui.sessionLogBody.innerHTML = "";
    }
    refreshSessionLogVisibility();
    updateSessionLogToggleLabel();
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
      return "Early " + Math.abs(rounded) + " ms";
    }
    if (rounded > 0) {
      return "Late " + rounded + " ms";
    }
    return "On time";
  }

  function resetLiveTimingFeedback(message) {
    const text = message || "Waiting for first tap";
    if (!ui.liveTimingFeedback || !ui.liveTimingText) {
      return;
    }
    ui.liveTimingFeedback.classList.remove("timing-good", "timing-warn", "timing-bad", "timing-extra");
    ui.liveTimingText.textContent = text;
  }

  function setLiveTimingFeedback(args) {
    const offsetMs = args.offsetMs;
    const isExtra = !!args.isExtra;
    if (!ui.liveTimingFeedback || !ui.liveTimingText) {
      return;
    }
    ui.liveTimingFeedback.classList.remove("timing-good", "timing-warn", "timing-bad", "timing-extra");
    ui.liveTimingFeedback.classList.add(timingClassFromOffset(offsetMs));
    if (isExtra) {
      ui.liveTimingFeedback.classList.add("timing-extra");
    }
    const timingText = timingWordsFromOffset(offsetMs);
    ui.liveTimingText.textContent = isExtra ? "Extra tap: " + timingText : timingText;
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
      expectedIndex: expectedIndex,
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
    result.matchedTapIndices.forEach(function (tapIndex, expectedIndex) {
      if (tapIndex >= 0) {
        expectedByTapIndex.set(tapIndex, expectedIndex);
      }
    });

    const tapEvents = tapsMs.map(function (tapMs, tapIndex) {
      const expectedIndex = expectedByTapIndex.get(tapIndex);
      if (expectedIndex !== undefined) {
        return {
          tapMs: tapMs,
          offsetMs: Math.round(tapMs - expectedOnsetsMs[expectedIndex]),
          isExtra: false,
        };
      }
      const nearest = findNearestExpectedOffset(expectedOnsetsMs, tapMs);
      return {
        tapMs: tapMs,
        offsetMs: nearest.offsetMs,
        isExtra: true,
      };
    });

    const missedExpectedIndices = result.matchedTapIndices.reduce(function (indices, tapIndex, expectedIndex) {
      if (tapIndex === -1) {
        indices.push(expectedIndex);
      }
      return indices;
    }, []);

    return {
      label: label,
      tapEvents: tapEvents,
      missedExpectedIndices: missedExpectedIndices,
    };
  }

  function syncSelectedLevel(levelId) {
    const safeLevel = Math.max(1, Math.min(5, Number(levelId) || 1));
    if (ui.levelSelect) {
      ui.levelSelect.value = String(safeLevel);
    }
    if (ui.startLevelSelect) {
      ui.startLevelSelect.value = String(safeLevel);
    }
    appState.arcade.selectedStartLevel = safeLevel;
    return safeLevel;
  }

  function setArcadeOverlayMode(mode, options) {
    if (!ui.arcadeOverlay) {
      return;
    }

    const config = options || {};
    const safeMode = mode || "hidden";
    ui.arcadeOverlay.hidden = safeMode === "hidden";
    ui.arcadeOverlay.setAttribute("data-mode", safeMode);

    if (safeMode === "hidden") {
      return;
    }

    if (ui.overlayEyebrow) {
      ui.overlayEyebrow.textContent = config.eyebrow || "Arcade Mode";
    }
    if (ui.overlayTitle) {
      ui.overlayTitle.textContent = config.title || "Rhythm Rush";
    }
    if (ui.overlayText) {
      ui.overlayText.textContent = config.text || "";
    }
    if (ui.overlayLevelGroup) {
      ui.overlayLevelGroup.hidden = !config.showLevelSelect;
    }
    if (ui.overlayTempoGroup) {
      ui.overlayTempoGroup.hidden = !config.showTempoSelect;
    }
    if (ui.overlayPrimaryBtn) {
      ui.overlayPrimaryBtn.textContent = config.buttonText || "Start Run (Return)";
      ui.overlayPrimaryBtn.focus();
    }
  }

  function hideGameOverModal() {
    if (ui.gameOverModal) {
      ui.gameOverModal.hidden = true;
    }
  }

  function showGameOverModal(summary) {
    if (!ui.gameOverModal) {
      return;
    }
    ui.gameOverModal.hidden = false;
    if (ui.gameOverTitle) {
      ui.gameOverTitle.textContent = "Game Over";
    }
    if (ui.gameOverScoreValue) {
      ui.gameOverScoreValue.textContent = formatArcadeScore(summary.finalScore);
    }
    if (ui.gameOverRhythmsValue) {
      ui.gameOverRhythmsValue.textContent = String(summary.rhythmsCleared);
    }
    if (ui.gameOverPeakLevelValue) {
      ui.gameOverPeakLevelValue.textContent = "L" + summary.peakLevel;
    }
    if (ui.gameOverBestComboValue) {
      ui.gameOverBestComboValue.textContent = String(summary.bestCombo);
    }
    if (ui.gameOverBestChainValue) {
      ui.gameOverBestChainValue.textContent = "x" + summary.bestChain;
    }
    if (ui.playAgainBtn) {
      ui.playAgainBtn.focus();
    }
  }

  function openTitleScreen() {
    clearArcadeStreamTimers();
    appState.arcade.streamPhase = "idle";
    appState.arcade.activeLineSession = null;
    appState.arcade.activeLiveFeedback = NOOP_LIVE_FEEDBACK;
    appState.arcade.scrollMetrics = null;
    appState.arcade.runState = "title";
    syncSelectedLevel(appState.arcade.selectedStartLevel || 1);
    setStatus("Title Screen");
    setBeatIndicator(false, "Ready");
    setTapStatus("Choose a starting level and begin a new run.");
    resetLiveTimingFeedback("Press Return to start");
    if (ui.notationContainer) {
      ui.notationContainer.classList.remove("is-arcade-score", "stream-shift");
      ui.notationContainer.style.height = "";
      ui.notationContainer.innerHTML = "";
    }
    hideGameOverModal();
    setArcadeOverlayMode("title", {
      eyebrow: "Arcade Mode",
      title: "Rhythm Rush",
      text:
        "Choose a starting level and tempo, then survive the endless rhythm stream. Strong clears level you up over time.",
      buttonText: "Start Run (Return)",
      showLevelSelect: true,
      showTempoSelect: true,
    });
  }

  function buildGameOverSummary() {
    return {
      finalScore: appState.arcade.score,
      rhythmsCleared: appState.arcade.rhythmsCleared,
      peakLevel: appState.arcade.peakLevel,
      bestCombo: appState.arcade.bestStreak,
      bestChain: appState.arcade.bestRhythmSetChain,
    };
  }

  function getArcadeMeasuresPerLine(levelId, timeSignature) {
    const width =
      ui.notationPanel?.clientWidth || ui.notationContainer?.clientWidth || window.innerWidth || 1280;
    const safeLevel = Math.max(1, Math.min(5, Number(levelId) || appState.arcade.currentLevel || 1));
    const signatureKey = timeSignatureToString(timeSignature);
    let measures = width >= 1220 ? 4 : width >= 900 ? 3 : 2;

    if (safeLevel >= 5) {
      measures = Math.min(measures, 3);
    }

    if (signatureKey === "5/4") {
      measures = Math.min(measures, 2);
    } else if (signatureKey === "7/8") {
      measures = Math.min(measures, width >= 1160 ? 3 : 2);
    } else if (safeLevel >= 5 && signatureKey === "4/4") {
      measures = Math.min(measures, width >= 1160 ? 3 : 2);
    }

    return Math.max(2, measures);
  }

  function createArcadeExercise(levelId, options) {
    const config = options || {};
    const safeLevel = Math.max(1, Math.min(5, Number(levelId) || 1));
    const levelConfig = getLevelConfig(safeLevel);
    const timeSignature = cloneTimeSignature(config.timeSignature || appState.arcade.currentTimeSignature);
    const preferredMeasuresPerExercise = Math.max(
      1,
      Number(config.measuresPerExercise) || getArcadeMeasuresPerLine(safeLevel, timeSignature),
    );
    let lastError = null;

    for (let measuresPerExercise = preferredMeasuresPerExercise; measuresPerExercise >= 1; measuresPerExercise -= 1) {
      try {
        const exercise = createValidatedExercise(levelConfig, {
          tempoBpm: appState.arcade.fixedTempoBpm,
          measuresPerExercise: measuresPerExercise,
          timeSignature: timeSignature,
        });
        exercise.level = safeLevel;
        if (measuresPerExercise !== preferredMeasuresPerExercise) {
          recordArcadeDiagnostic("line-density-fallback", {
            level: safeLevel,
            timeSignature: timeSignatureToString(timeSignature),
            preferredMeasuresPerExercise: preferredMeasuresPerExercise,
            actualMeasuresPerExercise: measuresPerExercise,
          });
        }
        return exercise;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Failed to create arcade exercise.");
  }

  function regenerateArcadeLine(lineRef) {
    if (!lineRef || !lineRef.exercise) {
      return false;
    }

    const safeLevel = Math.max(1, Math.min(5, Number(lineRef.exercise.level) || appState.arcade.currentLevel || 1));
    recordArcadeDiagnostic("line-regenerate", {
      level: safeLevel,
      previousExercise: summarizeExerciseForDiagnostics(lineRef.exercise),
    });
    lineRef.exercise = createArcadeExercise(safeLevel, {
      measuresPerExercise: lineRef.exercise.measuresPerExercise,
      timeSignature: cloneTimeSignature(lineRef.exercise.timeSignature),
    });
    lineRef.analysisRows = [];
    return true;
  }

  function syncReadoutsForExercise(exercise) {
    if (!exercise) {
      return;
    }
    appState.exercise = exercise;
    if (ui.timeSignatureValue) {
      ui.timeSignatureValue.textContent = exercise.timeSignature.num + "/" + exercise.timeSignature.den;
    }
    syncTempoControls(exercise.tempoBpm);
  }

  function buildArcadeLine(levelId, options) {
    return {
      id: ++appState.rhythmIdCounter,
      exercise: createArcadeExercise(levelId, options),
      analysisRows: [],
    };
  }

  function ensureArcadePreviewLines() {
    while (appState.arcade.lines.length < 4) {
      appState.arcade.lines.push(
        buildArcadeLine(appState.arcade.currentLevel, {
          timeSignature: cloneTimeSignature(appState.arcade.currentTimeSignature),
        }),
      );
    }
  }

  function buildVisibleArcadeLineEntries() {
    const lines = appState.arcade.lines;
    if (!lines.length) {
      return [];
    }

    return lines.slice(0, 4).map(function (line, visibleIndex) {
      return {
        role: visibleIndex === 0 ? "current" : "next",
        exercise: line.exercise,
        analysisRows: [],
        lineRef: line,
      };
    });
  }

  function resetArcadeStreamScroll() {
    const svg = ui.notationContainer?.querySelector("svg");
    if (!svg) {
      return;
    }
    svg.style.transform = "translateY(0px)";
  }

  function getArcadeScrollMetrics(exercise, systemHeight) {
    const safeSystemHeight = Math.max(1, Number(systemHeight) || 194);
    const safeExercise = exercise || null;
    const measuresPerLine = Math.max(
      1,
      Number(safeExercise?.measuresPerExercise) || appState.arcade.measuresPerLine || 1,
    );
    const beatGroupsPerMeasure = Math.max(
      1,
      Array.isArray(getBeatGroupTicks(safeExercise?.timeSignature || parseTimeSignature("4/4")))
        ? getBeatGroupTicks(safeExercise?.timeSignature || parseTimeSignature("4/4")).length
        : 1,
    );
    const totalBeatGroups = Math.max(1, measuresPerLine * beatGroupsPerMeasure);
    const scrollingBeatGroups = Math.min(
      totalBeatGroups - 0.25,
      totalBeatGroups >= 10 ? 1.75 : totalBeatGroups >= 6 ? 1.4 : 1.15,
    );
    const scrollStartProgress =
      totalBeatGroups <= 1
        ? 0.88
        : Math.max(0.78, 1 - scrollingBeatGroups / totalBeatGroups);

    return {
      maxOffsetPx: Math.round(safeSystemHeight * 0.84),
      scrollStartProgress: scrollStartProgress,
    };
  }

  function updateArcadeStreamScroll(elapsedMs, totalDurationMs) {
    const svg = ui.notationContainer?.querySelector("svg");
    const metrics = appState.arcade.scrollMetrics;
    if (!svg || !metrics) {
      return;
    }

    const safeTotalMs = Math.max(1, totalDurationMs || 1);
    const progress = Math.max(0, Math.min(1, elapsedMs / safeTotalMs));
    const startProgress = metrics.scrollStartProgress;
    const maxOffsetPx = metrics.maxOffsetPx;
    let offsetPx = 0;

    if (progress > startProgress) {
      const normalized = Math.max(
        0,
        Math.min(1, (progress - startProgress) / Math.max(0.001, 1 - startProgress)),
      );
      const eased = normalized * normalized * (3 - 2 * normalized);
      offsetPx = -maxOffsetPx * eased;
    }

    svg.style.transform = "translateY(" + offsetPx.toFixed(2) + "px)";
  }

  function renderArcadeStream(animateShift) {
    if (!ui.notationContainer) {
      return NOOP_LIVE_FEEDBACK;
    }

    let VF;
    try {
      VF = assertVexFlow();
    } catch (error) {
      renderFallback(ui.notationContainer, error.message);
      return NOOP_LIVE_FEEDBACK;
    }

    for (let renderAttempt = 0; renderAttempt < 3; renderAttempt += 1) {
      const entries = buildVisibleArcadeLineEntries();
      if (!entries.length) {
        appState.arcade.scrollMetrics = null;
        ui.notationContainer.style.height = "";
        ui.notationContainer.innerHTML = "";
        return NOOP_LIVE_FEEDBACK;
      }

      try {
        entries.forEach(function (entry) {
          validateExerciseForDisplay(entry.exercise);
        });

        ui.notationContainer.classList.add("is-arcade-score");
        ui.notationContainer.classList.remove("stream-shift");
        ui.notationContainer.innerHTML = "";
        const width = Math.max(780, ui.notationContainer.clientWidth || 780);
        const systemHeight = 194;
        const viewportLineCount = Math.min(3, entries.length);
        const height = 26 + entries.length * systemHeight + 26;
        const viewportHeight = 26 + viewportLineCount * systemHeight + 26;
        ui.notationContainer.style.height = viewportHeight + "px";
        appState.arcade.scrollMetrics = getArcadeScrollMetrics(entries[0]?.exercise || null, systemHeight);
        const renderer = new VF.Renderer(ui.notationContainer, VF.Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();
        const svg = ui.notationContainer.querySelector("svg");
        if (svg) {
          svg.style.willChange = "transform";
        }
        const svgNs = "http://www.w3.org/2000/svg";
        const renderedLines = [];
        let failedEntry = null;

        for (let visibleIndex = 0; visibleIndex < entries.length; visibleIndex += 1) {
          const entry = entries[visibleIndex];
          failedEntry = entry;
          const topY = 26 + visibleIndex * systemHeight;
          const paper = document.createElementNS(svgNs, "rect");
          paper.setAttribute("x", "10");
          paper.setAttribute("y", String(topY - 10));
          paper.setAttribute("width", String(width - 20));
          paper.setAttribute("height", "164");
          paper.setAttribute("rx", "16");
          paper.setAttribute(
            "fill",
            entry.role === "current"
              ? "rgba(255,255,255,0.99)"
              : entry.role === "past"
                ? "rgba(248,252,255,0.93)"
                : "rgba(249,252,255,0.96)",
          );
          paper.setAttribute(
            "stroke",
            entry.role === "current" ? "rgba(89,231,165,0.55)" : "rgba(138,176,230,0.28)",
          );
          paper.setAttribute("stroke-width", entry.role === "current" ? "2" : "1.2");
          svg.append(paper);

          const system = drawExerciseSystem({
            VF: VF,
            context: context,
            exercise: entry.exercise,
            topY: topY,
            width: width,
            showTimeSignature: true,
          });

          renderedLines.push({
            role: entry.role,
            lineRef: entry.lineRef,
            exercise: entry.exercise,
            onsetAnchors: system.onsetAnchors,
            timelineBounds: system.timelineBounds,
          });

          if (entry.analysisRows && entry.analysisRows.length) {
            drawNotationAnalysisRowsOnSvg(
              svg,
              system.onsetAnchors,
              entry.exercise.expectedOnsetsMs,
              entry.exercise.totalDurationMs,
              system.timelineBounds,
              entry.analysisRows,
            );
          }
        }

        const activeLine = appState.arcade.lines[appState.arcade.activeLineIndex];
        const activeRenderedLine = renderedLines.find(function (line) {
          return line.lineRef === activeLine;
        });
        if (!activeRenderedLine) {
          return NOOP_LIVE_FEEDBACK;
        }

        const liveFeedback = createLiveNoteFeedbackLayer(
          ui.notationContainer,
          activeRenderedLine.onsetAnchors,
          activeRenderedLine.exercise.expectedOnsetsMs,
          activeRenderedLine.exercise.totalDurationMs,
          activeRenderedLine.timelineBounds,
          {
            onProgress: updateArcadeStreamScroll,
          },
        );
        resetArcadeStreamScroll();
        return liveFeedback;
      } catch (error) {
        ui.notationContainer.innerHTML = "";
        const fallbackEntry = entries[0];
        const targetEntry = failedEntry || fallbackEntry;
        recordArcadeDiagnostic("stream-render-failed", {
          error: error.message,
          failedExercise: summarizeExerciseForDiagnostics(targetEntry?.exercise || null),
          visibleExercises: entries.map(function (entry) {
            return summarizeExerciseForDiagnostics(entry.exercise);
          }),
        });
        try {
          if (targetEntry && regenerateArcadeLine(targetEntry.lineRef)) {
            continue;
          }
        } catch (regenError) {
          recordArcadeDiagnostic("stream-regenerate-threw", {
            error: regenError.message,
            failedExercise: summarizeExerciseForDiagnostics(targetEntry?.exercise || null),
          });
          error = regenError;
        }
        renderFallback(ui.notationContainer, "Stream regeneration failed: " + error.message);
        setArcadeBanner("STREAM REGEN FAILED", "bad");
        pauseArcadeForRenderFailure("The notation stream failed to regenerate cleanly.");
        return NOOP_LIVE_FEEDBACK;
      }
    }

    renderFallback(ui.notationContainer, "Stream regeneration exceeded retry limit.");
    setArcadeBanner("STREAM REGEN FAILED", "bad");
    pauseArcadeForRenderFailure("The notation stream exceeded its retry limit.");
    return NOOP_LIVE_FEEDBACK;
  }

  function setupArcadeLineQueue() {
    appState.arcade.activeLineIndex = 0;
    const allowedTimeSignatures = getLevelConfig(appState.arcade.currentLevel).allowedTimeSignatures;
    const currentSignatureKey = timeSignatureToString(appState.arcade.currentTimeSignature);
    if (!currentSignatureKey || !allowedTimeSignatures.includes(currentSignatureKey)) {
      appState.arcade.currentTimeSignature = getArcadeOpeningTimeSignature(appState.arcade.currentLevel);
    }
    appState.arcade.measuresPerLine = getArcadeMeasuresPerLine(
      appState.arcade.currentLevel,
      appState.arcade.currentTimeSignature,
    );
    appState.arcade.lines = [
      buildArcadeLine(appState.arcade.currentLevel, {
        measuresPerExercise: appState.arcade.measuresPerLine,
        timeSignature: cloneTimeSignature(appState.arcade.currentTimeSignature),
      }),
    ];
    ensureArcadePreviewLines();
    syncReadoutsForExercise(appState.arcade.lines[0].exercise);
    appState.arcade.activeLiveFeedback = renderArcadeStream(false);
  }

  function advanceArcadeDifficulty(result) {
    const strongClear = result.overallAccuracy >= 88 && result.missedCount <= 1 && result.extraTapCount <= 1;
    appState.arcade.lastClearAccuracy = result.overallAccuracy;
    if (!strongClear) {
      appState.arcade.strongClearStreak = 0;
      return;
    }

    appState.arcade.strongClearStreak += 1;
    if (appState.arcade.strongClearStreak >= 2 && appState.arcade.currentLevel < 5) {
      appState.arcade.currentLevel += 1;
      appState.arcade.peakLevel = Math.max(appState.arcade.peakLevel, appState.arcade.currentLevel);
      appState.arcade.strongClearStreak = 0;
      setArcadeBanner("LEVEL UP! NOW L" + appState.arcade.currentLevel, "boost");
      spawnArcadeFloat("LEVEL " + appState.arcade.currentLevel, "boost", "lg");
    }
  }

  function finalizeRhythmClear(line, tapsMs, result) {
    const exercise = line.exercise;
    appState.arcade.rhythmsCleared += 1;
    const arcadeSummary = finalizeArcadeSession({
      accuracy: result.overallAccuracy,
      missed: result.missedCount,
      extra: result.extraTapCount,
      rhythmId: line.id,
    });
    advanceArcadeDifficulty(result);
    maybeAdvanceArcadeTimeSignature(result);

    line.analysisRows = [buildNotationAnalysisRow("Clear", exercise.expectedOnsetsMs, tapsMs, result)];
    appState.arcade.activeLineIndex = 1;
    ensureArcadePreviewLines();
    appState.arcade.lines = appState.arcade.lines.slice(1);
    appState.arcade.activeLineIndex = 0;
    ensureArcadePreviewLines();
    const currentLine = appState.arcade.lines[0];
    if (currentLine) {
      syncReadoutsForExercise(currentLine.exercise);
    }
    updateArcadeHud();
    appState.arcade.activeLiveFeedback = renderArcadeStream(false);
    setTapStatus(
      "Lines cleared: " +
        appState.arcade.rhythmsCleared +
        ". Accuracy " +
        result.overallAccuracy +
        "%. Score " +
        formatArcadeScore(arcadeSummary.finalScore) +
        ".",
    );
  }

  function populateLevelSelector() {
    listLevelIds().forEach(function (levelId) {
      [ui.levelSelect, ui.startLevelSelect].forEach(function (selectEl) {
        if (!selectEl) {
          return;
        }
        const option = document.createElement("option");
        option.value = String(levelId);
        option.textContent = "Level " + levelId;
        selectEl.append(option);
      });
    });
    syncSelectedLevel(1);
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

    ui.timeSignatureValue.textContent = exercise.timeSignature.num + "/" + exercise.timeSignature.den;
    syncTempoControls(exercise.tempoBpm);
    ui.notationContainer.classList.remove("is-arcade-score", "stream-shift");
    ui.notationContainer.style.height = "";
    appState.arcade.scrollMetrics = null;
    renderNotation(ui.notationContainer, exercise, []);
  }

  function applyTempoToExercise(tempoBpm, source) {
    const tempo = clampTempo(tempoBpm);
    appState.selectedTempoBpm = tempo;
    syncTempoControls(tempo);

    if (appState.isSessionActive && source === "user") {
      setTapStatus("Tempo locked during live play. The new tempo will apply to the next run.");
      return;
    }

    if (!appState.exercise) {
      return;
    }

    appState.exercise.tempoBpm = tempo;
    appState.exercise.expectedOnsetsMs = buildExpectedOnsetsMs(appState.exercise.notes, tempo);
    appState.exercise.totalDurationMs = getExerciseDurationMs(appState.exercise.notes, tempo);
    setTapStatus("Expected notes to hit: " + appState.exercise.expectedOnsetsMs.length);

    if (timingEngine.shouldTrapSpacebar() && source === "user") {
      setStatus("Tempo changed");
      setTapStatus("Tempo updated for next attempt.");
    }
  }

  function generateNewExercise() {
    if (appState.isSessionActive) {
      return;
    }
    if (appState.arcade.gameOver) {
      setArcadeBanner("GAME OVER! PRESS RESTART", "bad");
      setPostRunActionsMode("gameover");
      return;
    }
    setPostRunActionsMode("hidden");

    const levelConfig = currentLevelConfig();
    try {
      appState.exercise = createValidatedExercise(levelConfig);
      appState.rhythmIdCounter += 1;
      appState.currentRhythmId = appState.rhythmIdCounter;
    } catch (error) {
      appState.exercise = null;
      resetResults();
      renderNotation(ui.notationContainer, null, []);
      setStatus("Error");
      setBeatIndicator(false, "Error");
      setTapStatus("Generation failed: " + error.message);
      resetLiveTimingFeedback("No exercise loaded");
      setArcadeBanner("CHART LOAD FAILED", "bad");
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
    setTapStatus("Expected notes to hit: " + appState.exercise.expectedOnsetsMs.length);
    resetLiveTimingFeedback();
    setArcadeBanner("NEW CHART READY", "good");
  }

  function showLoopDetail(loopIndex) {
    if (!appState.loopResults.length || !ui.feedbackTableBody) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(appState.loopResults.length - 1, loopIndex));
    const result = appState.loopResults[safeIndex];
    const tapsMs = appState.loopTapSets[safeIndex];

    renderAttemptTable(ui.feedbackTableBody, appState.exercise.expectedOnsetsMs, tapsMs, result);
    if (ui.timelineStrip) {
      ui.timelineStrip.innerHTML = "";
    }
    setTapStatus("Showing loop " + (safeIndex + 1) + " detail. Taps: " + tapsMs.length);
  }

  function addLoopButtons(loopCount) {
    for (let idx = 0; idx < loopCount; idx += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "loop-pill";
      button.textContent = "Show loop " + (idx + 1) + " detail";
      button.addEventListener("click", () => showLoopDetail(idx));
      ui.loopBreakdown.append(button);
    }
  }

  function handleNextRhythmAction() {
    if (appState.isSessionActive || appState.arcade.gameOver) {
      return;
    }
    generateNewExercise();
  }

  function handleRetryRhythmAction() {
    if (appState.isSessionActive || appState.arcade.gameOver || !appState.exercise) {
      return;
    }
    runSession(appState.lastSessionLoops || 1);
  }

  function handleRestartArcadeAction() {
    if (appState.isSessionActive) {
      return;
    }
    resetArcadeProfileState();
    hideGameOverModal();
    openTitleScreen();
  }

  function handleOverlayPrimaryAction() {
    if (appState.isSessionActive) {
      return;
    }

    if (appState.arcade.runState === "paused") {
      startArcadeRun({ continueExisting: true });
      return;
    }

    startArcadeRun({ continueExisting: false });
  }

  function handlePlayAgainAction() {
    if (appState.isSessionActive) {
      return;
    }
    resetArcadeProfileState();
    hideGameOverModal();
    openTitleScreen();
  }

  function scheduleArcadeTimeout(msFromNow, fn, label) {
    const timeoutId = setTimeout(function () {
      appState.arcade.streamTimers.delete(timeoutId);
      try {
        fn();
      } catch (error) {
        handleArcadeRuntimeError(error, {
          label: label || "timer",
        });
      }
    }, Math.max(0, msFromNow));
    appState.arcade.streamTimers.add(timeoutId);
    return timeoutId;
  }

  function scheduleArcadeAt(targetTimeMs, fn, label) {
    return scheduleArcadeTimeout(targetTimeMs - performance.now(), fn, label);
  }

  function waitForAnimationFrames(frameCount) {
    const safeFrameCount = Math.max(1, Number(frameCount) || 1);
    return new Promise(function (resolve) {
      let remaining = safeFrameCount;
      const step = function () {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function getBeatDurationsMs(timeSignature, tempoBpm) {
    const safeTempo = clampTempo(tempoBpm);
    const msPerTick = (60000 / safeTempo) / PPQ;
    return getBeatGroupTicks(timeSignature).map(function (tickCount) {
      return tickCount * msPerTick;
    });
  }

  function clearArcadeStreamTimers() {
    appState.arcade.streamTimers.forEach(function (timeoutId) {
      clearTimeout(timeoutId);
    });
    appState.arcade.streamTimers.clear();
  }

  function getActiveArcadeLine() {
    return appState.arcade.lines[appState.arcade.activeLineIndex] || null;
  }

  function scheduleArcadeBeatSeries(startTimeMs, exercise, phase) {
    if (!exercise || !exercise.timeSignature || !exercise.tempoBpm) {
      return;
    }

    const beatDurationsMs = getBeatDurationsMs(exercise.timeSignature, exercise.tempoBpm);
    const beatsPerMeasure = Math.max(1, beatDurationsMs.length);
    const measuresPerExercise = Math.max(1, Number(exercise.measuresPerExercise) || 1);
    const measureDurationMs = beatDurationsMs.reduce(function (sum, durationMs) {
      return sum + durationMs;
    }, 0);

    for (let measureIndex = 0; measureIndex < measuresPerExercise; measureIndex += 1) {
      let beatCursorMs = 0;
      for (let beatIndex = 0; beatIndex < beatsPerMeasure; beatIndex += 1) {
        const targetTimeMs = startTimeMs + measureIndex * measureDurationMs + beatCursorMs;
        const beatInMeasure = beatIndex + 1;
        scheduleArcadeAt(targetTimeMs, function () {
          if (!appState.isSessionActive || appState.arcade.runState !== "active") {
            return;
          }

          const activeSession = appState.arcade.activeLineSession;
          const isCurrentLineBeat =
            phase === "performing" &&
            activeSession &&
            activeSession.lineStartTimeMs === startTimeMs;
          const isCountInBeat = phase === "count-in" && appState.arcade.streamPhase === "count-in";
          if (!isCurrentLineBeat && !isCountInBeat) {
            return;
          }

          metronome.tick(beatInMeasure === 1);
          setBeatIndicator(
            true,
            (phase === "count-in" ? "Count-in" : "Live") + ": beat " + beatInMeasure,
          );
        }, phase + "-beat-" + measureIndex + "-" + beatInMeasure);
        beatCursorMs += beatDurationsMs[beatIndex];
      }
    }
  }

  function getCountInExerciseForLine(line) {
    if (!line || !line.exercise) {
      return null;
    }

    const measureDurationMs =
      getMeasureTicks(line.exercise.timeSignature) * ((60000 / line.exercise.tempoBpm) / PPQ);

    return {
      timeSignature: { ...line.exercise.timeSignature },
      tempoBpm: line.exercise.tempoBpm,
      measuresPerExercise: 1,
      totalDurationMs: measureDurationMs,
    };
  }

  function pauseArcadeForRenderFailure(message) {
    recordArcadeDiagnostic("stream-paused", {
      reason: message,
      activeLine: summarizeExerciseForDiagnostics(getActiveArcadeLine()?.exercise || null),
    });
    clearArcadeStreamTimers();
    appState.arcade.activeLiveFeedback.stopPlayhead();
    appState.arcade.streamPhase = "idle";
    appState.arcade.activeLineSession = null;
    appState.isSessionActive = false;
    appState.arcade.runState = "paused";
    setButtonsDisabled(false);
    setStatus("Render Error");
    setBeatIndicator(false, "Error");
    setTapStatus(message);
    resetLiveTimingFeedback("Render error");
    setArcadeBanner("STREAM ERROR", "bad");
    setArcadeOverlayMode("paused", {
      eyebrow: "Render Error",
      title: "Stream Interrupted",
      text: message + " Press Return to regenerate and continue.",
      buttonText: "Continue Run (Return)",
      showLevelSelect: false,
      showTempoSelect: false,
    });
  }

  function scheduleActiveArcadeLineMisses(session) {
    const exercise = session.line.exercise;
    exercise.expectedOnsetsMs.forEach(function (expectedMs, expectedIndex) {
      const targetTimeMs =
        session.lineStartTimeMs +
        expectedMs +
        getMissCheckDelayMs(exercise.expectedOnsetsMs, expectedIndex);
      scheduleArcadeAt(targetTimeMs, function () {
        if (
          !appState.isSessionActive ||
          appState.arcade.streamPhase !== "performing" ||
          appState.arcade.activeLineSession !== session ||
          session.resolvedExpectedIndices.has(expectedIndex)
        ) {
          return;
        }
        session.resolvedExpectedIndices.add(expectedIndex);
        appState.arcade.activeLiveFeedback.flashMiss(expectedIndex);
        registerArcadeMiss();
      }, "miss-check-" + expectedIndex);
    });
  }

  function beginActiveArcadeLine(startTimeMs) {
    if (!appState.isSessionActive || appState.arcade.runState !== "active") {
      return;
    }

    const line = getActiveArcadeLine();
    if (!line) {
      return;
    }

    syncReadoutsForExercise(line.exercise);
    if (!appState.arcade.activeLiveFeedback || appState.arcade.activeLiveFeedback === NOOP_LIVE_FEEDBACK) {
      appState.arcade.activeLiveFeedback = renderArcadeStream(false);
    }
    appState.arcade.activeLiveFeedback.clear();

    const session = {
      line: line,
      lineStartTimeMs: typeof startTimeMs === "number" ? startTimeMs : performance.now(),
      tapsMs: [],
      totalTapCount: 0,
      resolvedExpectedIndices: new Set(),
    };
    appState.arcade.activeLineSession = session;
    appState.arcade.streamPhase = "performing";
    appState.arcade.activeLiveFeedback.startPlayhead(
      line.exercise.totalDurationMs,
      session.lineStartTimeMs,
    );
    scheduleArcadeBeatSeries(session.lineStartTimeMs, line.exercise, "performing");
    scheduleActiveArcadeLineMisses(session);

    setStatus("Live");
    setBeatIndicator(true, "Play");
    resetLiveTimingFeedback("Line active");
    setTapStatus("Keep the stream moving. The next line is already coming.");
    setArcadeBanner("LINE " + (appState.arcade.rhythmsCleared + 1), "neutral");

    const lineEndTimeMs = session.lineStartTimeMs + line.exercise.totalDurationMs;
    scheduleArcadeAt(lineEndTimeMs, function () {
      if (
        !appState.isSessionActive ||
        appState.arcade.runState !== "active" ||
        appState.arcade.activeLineSession !== session
      ) {
        return;
      }

      appState.arcade.activeLiveFeedback.stopPlayhead();
      const result = gradeAttempt(line.exercise.expectedOnsetsMs, session.tapsMs);
      finalizeRhythmClear(line, session.tapsMs, result);
      addSessionLogEntry({
        attemptNumber: appState.nextAttemptNumber++,
        level: line.exercise.level,
        loops: 1,
        tempoBpm: line.exercise.tempoBpm,
        accuracy: result.overallAccuracy,
        taps: session.totalTapCount,
        missed: result.missedCount,
        extra: result.extraTapCount,
        status: "completed",
      });
      appState.arcade.activeLineSession = null;

      if (appState.arcade.runState === "active" && !appState.arcade.gameOver) {
        beginActiveArcadeLine(lineEndTimeMs);
      }
    }, "line-end");
  }

  function registerArcadeTap(now) {
    const session = appState.arcade.activeLineSession;
    if (
      !session ||
      !appState.isSessionActive ||
      appState.arcade.runState !== "active" ||
      appState.arcade.streamPhase !== "performing"
    ) {
      return false;
    }

    const tapTime = typeof now === "number" ? now : performance.now();
    const withinLineMs = Math.round(
      tapTime - session.lineStartTimeMs - appState.arcade.latencyCompensationMs,
    );
    if (withinLineMs < -260 || withinLineMs > session.line.exercise.totalDurationMs + 260) {
      return false;
    }

    session.tapsMs.push(withinLineMs);
    session.totalTapCount += 1;

    const nearest = findNearestExpectedOffset(session.line.exercise.expectedOnsetsMs, withinLineMs);
    const isExtraTap = session.resolvedExpectedIndices.has(nearest.expectedIndex);
    if (!isExtraTap && nearest.expectedIndex >= 0) {
      session.resolvedExpectedIndices.add(nearest.expectedIndex);
    }

    appState.arcade.activeLiveFeedback.flashTap(withinLineMs, nearest.offsetMs);
    setLiveTimingFeedback({ offsetMs: nearest.offsetMs, isExtra: isExtraTap });
    if (isExtraTap) {
      registerArcadeExtraTap(nearest.offsetMs);
    } else {
      registerArcadeHit(nearest.offsetMs);
    }
    return true;
  }

  function cancelArcadeStream(reason) {
    const cancelReason = reason || "user";
    if (!appState.isSessionActive && appState.arcade.streamPhase === "idle") {
      return false;
    }

    appState.arcade.activeLiveFeedback.stopPlayhead();
    clearArcadeStreamTimers();
    appState.arcade.streamPhase = "idle";
    appState.arcade.activeLineSession = null;
    appState.isSessionActive = false;
    setButtonsDisabled(false);
    setBeatIndicator(false, cancelReason === "game-over" ? "Game Over" : "Stopped");

    if (cancelReason === "life-lost") {
      appState.arcade.runState = "paused";
      setStatus("Life Lost");
      setTapStatus("Life lost. Press Return to restart the stream with your remaining lives.");
      resetLiveTimingFeedback("Life lost");
      setArcadeOverlayMode("paused", {
        eyebrow: "Life Lost",
        title: "Shield Down",
        text: "The music stopped. Press Return to jump back in on a fresh line with the same run.",
        buttonText: "Continue Run (Return)",
        showLevelSelect: false,
        showTempoSelect: false,
      });
      return true;
    }

    if (cancelReason === "game-over" || appState.arcade.gameOver) {
      appState.arcade.runState = "gameover";
      const summary = buildGameOverSummary();
      appState.arcade.lastGameOverSummary = summary;
      setStatus("Game Over");
      setTapStatus("Run over. Final score ready.");
      resetLiveTimingFeedback("Run over");
      setArcadeOverlayMode("hidden");
      showGameOverModal(summary);
      return true;
    }

    appState.arcade.runState = "paused";
    setStatus("Stopped");
    setTapStatus("Run interrupted.");
    resetLiveTimingFeedback("Run stopped");
    setArcadeOverlayMode("paused", {
      eyebrow: "Paused",
      title: "Run Interrupted",
      text: "Press Return to restart the stream.",
      buttonText: "Continue Run (Return)",
      showLevelSelect: false,
      showTempoSelect: false,
    });
    return true;
  }

  async function runArcadeSegment() {
    const activeLine = getActiveArcadeLine();
    if (appState.isSessionActive || appState.arcade.runState !== "active" || !activeLine) {
      return;
    }

    resetResults();
    prepareArcadeRunState();
    clearArcadeStreamTimers();
    syncReadoutsForExercise(activeLine.exercise);
    appState.arcade.activeLiveFeedback = renderArcadeStream(false);
    setButtonsDisabled(true);
    appState.isSessionActive = true;
    appState.arcade.streamPhase = "count-in";
    appState.arcade.activeLineSession = null;
    setStatus("Count-in");
    setTapStatus("Prepare for the stream...");
    resetLiveTimingFeedback("Waiting for count-in...");
    setArcadeBanner("GET READY...", "neutral");

    try {
      await metronome.prime();
      await waitForAnimationFrames(2);
      appState.arcade.latencyCompensationMs = metronome.getEstimatedLatencyMs() + 30;
      const countInExercise = getCountInExerciseForLine(activeLine);
      if (!countInExercise) {
        throw new Error("Count-in preparation failed.");
      }
      const countInLeadInMs = 260;
      const countInStartTimeMs = performance.now() + countInLeadInMs;
      const lineStartTimeMs = countInStartTimeMs + countInExercise.totalDurationMs;

      setTapStatus("Prepare for the stream... count-in starts in a moment.");
      scheduleArcadeBeatSeries(countInStartTimeMs, countInExercise, "count-in");
      scheduleArcadeAt(lineStartTimeMs, function () {
        beginActiveArcadeLine(lineStartTimeMs);
      }, "line-start");
    } catch (error) {
      clearArcadeStreamTimers();
      appState.arcade.streamPhase = "idle";
      appState.arcade.activeLineSession = null;
      appState.isSessionActive = false;
      setButtonsDisabled(false);
      setStatus("Error");
      setBeatIndicator(false, "Error");
      setTapStatus("Run failed: " + error.message);
      setArcadeBanner("SYSTEM ERROR", "bad");
      spawnArcadeFloat("ERROR", "bad", "lg");
      appState.arcade.runState = "paused";
      setArcadeOverlayMode("paused", {
        eyebrow: "System Error",
        title: "Run Interrupted",
        text: "Something failed while starting the next line. Press Return to try again.",
        buttonText: "Continue Run (Return)",
        showLevelSelect: false,
        showTempoSelect: false,
      });
    }
  }

  function startArcadeRun(options) {
    const config = options || {};
    if (appState.isSessionActive) {
      return;
    }

    hideGameOverModal();
    setArcadeOverlayMode("hidden");

    if (!config.continueExisting) {
      resetArcadeProfileState();
      const chosenLevel = syncSelectedLevel(Number(ui.startLevelSelect?.value || 1));
      appState.arcade.currentLevel = chosenLevel;
      appState.arcade.peakLevel = chosenLevel;
      appState.arcade.fixedTempoBpm = clampTempo(
        Number(ui.overlayTempoInput?.value || appState.selectedTempoBpm || ui.tempoInput?.value || 90),
      );
    } else if (!appState.arcade.fixedTempoBpm) {
      appState.arcade.fixedTempoBpm = clampTempo(
        Number(ui.overlayTempoInput?.value || appState.selectedTempoBpm || ui.tempoInput?.value || 90),
      );
    }

    appState.selectedTempoBpm = appState.arcade.fixedTempoBpm;
    syncTempoControls(appState.arcade.fixedTempoBpm);

    appState.arcade.runState = "active";
    try {
      setupArcadeLineQueue();
    } catch (error) {
      recordArcadeDiagnostic("start-run-failed", {
        error: error.message,
        level: appState.arcade.currentLevel,
        tempoBpm: appState.arcade.fixedTempoBpm,
      });
      appState.arcade.runState = "paused";
      setStatus("Error");
      setBeatIndicator(false, "Error");
      setTapStatus("Run failed to build the opening stream.");
      setArcadeBanner("STARTUP ERROR", "bad");
      setArcadeOverlayMode("paused", {
        eyebrow: "Startup Error",
        title: "Run Interrupted",
        text: "Level " + appState.arcade.currentLevel + " failed during opening stream generation. Press Return to try again.",
        buttonText: "Retry Run (Return)",
        showLevelSelect: false,
        showTempoSelect: false,
      });
      return;
    }

    setStatus("Arcade Run");
    setTapStatus("Survive the stream. Keep hitting the live line.");
    resetLiveTimingFeedback("Press Space when the line starts");
    runArcadeSegment();
  }

  function installArcadeDebugHooks() {
    if (typeof window === "undefined") {
      return;
    }

    window.__rhythmDebug = {
      getDiagnostics: function () {
        return appState.arcade.diagnostics.slice();
      },
      stressArcadeLevel: function (levelId, sampleCount) {
        const safeLevel = Math.max(1, Math.min(5, Number(levelId) || 1));
        const safeCount = Math.max(1, Math.min(200, Number(sampleCount) || 24));
        const levelConfig = getLevelConfig(safeLevel);
        const successesBySignature = {};
        const failures = [];

        levelConfig.allowedTimeSignatures.forEach(function (signatureText) {
          successesBySignature[signatureText] = 0;
        });

        for (let index = 0; index < safeCount; index += 1) {
          const signatureText =
            levelConfig.allowedTimeSignatures[index % levelConfig.allowedTimeSignatures.length];
          try {
            createValidatedExercise(levelConfig, {
              tempoBpm: appState.arcade.fixedTempoBpm || appState.selectedTempoBpm || 90,
              measuresPerExercise: getArcadeMeasuresPerLine(
                safeLevel,
                parseTimeSignature(signatureText),
              ),
              timeSignature: parseTimeSignature(signatureText),
            });
            successesBySignature[signatureText] += 1;
          } catch (error) {
            failures.push({
              signature: signatureText,
              error: error.message,
            });
          }
        }

        const summary = {
          level: safeLevel,
          sampleCount: safeCount,
          successesBySignature: successesBySignature,
          failures: failures,
        };
        recordArcadeDiagnostic("stress-test", summary);
        return summary;
      },
    };
  }

  function installArcadeErrorCapture() {
    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("error", function (event) {
      if (!event) {
        return;
      }
      const error = event.error || new Error(event.message || "Window error");
      handleArcadeRuntimeError(error, {
        label: "window-error",
      });
    });

    window.addEventListener("unhandledrejection", function (event) {
      const reason = event?.reason;
      const error =
        reason instanceof Error
          ? reason
          : new Error(typeof reason === "string" ? reason : "Unhandled promise rejection");
      handleArcadeRuntimeError(error, {
        label: "unhandled-rejection",
      });
    });
  }

  function shouldIgnoreEnterShortcutTarget(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    const interactiveSelector = "input, textarea, select";
    if (target.matches(interactiveSelector) || target.closest(interactiveSelector)) {
      return true;
    }
    return false;
  }

  async function runSession(loops) {
    if (appState.isSessionActive) {
      return;
    }
    if (appState.arcade.gameOver) {
      setArcadeBanner("GAME OVER! PRESS RESTART", "bad");
      setStatus("Game Over");
      setTapStatus("No lives left. Restart to continue.");
      setPostRunActionsMode("gameover");
      return;
    }

    if (!appState.exercise) {
      generateNewExercise();
    }
    if (!appState.exercise) {
      return;
    }
    appState.lastSessionLoops = loops;
    setPostRunActionsMode("hidden");

    const sessionExercise = {
      ...appState.exercise,
      timeSignature: { ...appState.exercise.timeSignature },
      notes: appState.exercise.notes.map(function (note) {
        return { ...note };
      }),
      expectedOnsetsMs: [...appState.exercise.expectedOnsetsMs],
    };
    const sessionRhythmId = appState.currentRhythmId;
    const attemptNumber = appState.nextAttemptNumber;
    appState.nextAttemptNumber += 1;

    resetResults();
    prepareArcadeRunState();
    setArcadeBanner(loops === 1 ? "SINGLE ATTEMPT START" : "LOOP x" + loops + " CHALLENGE", "good");
    const liveNoteFeedback = renderNotation(ui.notationContainer, sessionExercise, []);
    const liveHitByLoop = Array.from({ length: loops }, function () {
      return new Set();
    });
    const missTimeouts = [];
    const clearMissTimeouts = function () {
      missTimeouts.forEach(function (timeoutId) {
        clearTimeout(timeoutId);
      });
      missTimeouts.length = 0;
    };
    const scheduleLoopMissChecks = function (loopNumber) {
      const loopIndex = loopNumber - 1;
      const hitSet = liveHitByLoop[loopIndex];
      if (!hitSet) {
        return;
      }

      sessionExercise.expectedOnsetsMs.forEach(function (expectedMs, expectedIndex) {
        const delayMs = expectedMs + getMissCheckDelayMs(sessionExercise.expectedOnsetsMs, expectedIndex);
        const timeoutId = setTimeout(function () {
          if (!appState.isSessionActive || hitSet.has(expectedIndex)) {
            return;
          }
          hitSet.add(expectedIndex);
          liveNoteFeedback.flashMiss(expectedIndex);
          registerArcadeMiss();
        }, Math.max(0, delayMs));
        missTimeouts.push(timeoutId);
      });
    };
    setButtonsDisabled(true);
    appState.isSessionActive = true;
    setStatus("Starting");
    setTapStatus("Preparing audio and count-in...");
    resetLiveTimingFeedback("Waiting for count-in...");
    setArcadeBanner("GET READY...", "neutral");

    let totalTapCount = 0;

    try {
      const extraLeadCompensationMs = 30;
      const latencyCompensationMs = metronome.getEstimatedLatencyMs() + extraLeadCompensationMs;
      setTapStatus(
        "Preparing audio and count-in... auto latency compensation " +
          latencyCompensationMs +
          " ms",
      );
      setArcadeBanner("COUNT-IN", "neutral");

      await timingEngine.start({
        exercise: sessionExercise,
        loops: loops,
        latencyCompensationMs: latencyCompensationMs,
        onStateChange: function (state) {
          if (state === "count-in") {
            setStatus("Count-in");
            setBeatIndicator(true, "Count-in...");
            setArcadeBanner("COUNT-IN", "neutral");
          } else if (state === "performing") {
            setStatus("Recording");
            setBeatIndicator(true, "Play now");
            setArcadeBanner("GO GO GO", "good");
          } else if (state === "complete") {
            setStatus("Scoring");
            setBeatIndicator(false, "Scoring...");
            setArcadeBanner("SCORING...", "neutral");
          } else if (state === "cancelled") {
            setStatus("Cancelled");
            setBeatIndicator(false, "Cancelled");
            setArcadeBanner("RUN CANCELLED", "bad");
          }
        },
        onBeat: function (payload) {
          const phaseText = payload.phase === "count-in" ? "Count-in" : "Playing";
          setBeatIndicator(true, phaseText + ": beat " + payload.beatInMeasure);
        },
        onLoopStart: function (loopNumber) {
          liveNoteFeedback.clear();
          liveNoteFeedback.startPlayhead(sessionExercise.totalDurationMs);
          scheduleLoopMissChecks(loopNumber);
          resetLiveTimingFeedback("Loop " + loopNumber + ": waiting for tap");
          setArcadeBanner("LOOP " + loopNumber + "/" + loops, "neutral");
          if (loops > 1) {
            setTapStatus("Loop " + loopNumber + "/" + loops + " active. Press Space on each note.");
          } else {
            setTapStatus("Attempt active. Press Space on each note.");
          }
        },
        onTap: function (payload) {
          totalTapCount = payload.totalTapCount;
          const nearest = findNearestExpectedOffset(sessionExercise.expectedOnsetsMs, payload.withinLoopMs);
          const hitSet = liveHitByLoop[payload.loop - 1];
          let isExtraTap = false;

          if (nearest.expectedIndex >= 0 && hitSet) {
            isExtraTap = hitSet.has(nearest.expectedIndex);
            hitSet.add(nearest.expectedIndex);
          }
          liveNoteFeedback.flashTap(payload.withinLoopMs, nearest.offsetMs);
          setLiveTimingFeedback({ offsetMs: nearest.offsetMs, isExtra: isExtraTap });
          if (isExtraTap) {
            registerArcadeExtraTap(nearest.offsetMs);
          } else {
            registerArcadeHit(nearest.offsetMs);
          }
          setTapStatus(
            "Loop " +
              payload.loop +
              "/" +
              loops +
              " active. Total taps: " +
              totalTapCount +
              ". " +
              timingWordsFromOffset(nearest.offsetMs) +
              ".",
          );
        },
        onComplete: function (payload) {
          liveNoteFeedback.stopPlayhead();
          clearMissTimeouts();
          appState.loopTapSets = payload.loopTapsMs;
          appState.isSessionActive = false;
          setButtonsDisabled(false);
          setBeatIndicator(false, "Finished");
          resetLiveTimingFeedback("Session complete");
          const recordedTaps = payload.loopTapsMs.reduce(function (sum, taps) {
            return sum + taps.length;
          }, 0);

          if (loops === 1) {
            const result = gradeAttempt(sessionExercise.expectedOnsetsMs, payload.loopTapsMs[0]);
            appState.loopResults = [result];
            renderSummaryCards(ui.summaryCards, result, "Attempt");
            const arcadeSummary = finalizeArcadeSession({
              accuracy: result.overallAccuracy,
              missed: result.missedCount,
              extra: result.extraTapCount,
              rhythmId: sessionRhythmId,
            });
            appendArcadeSummaryCards(ui.summaryCards, arcadeSummary);
            renderNotation(ui.notationContainer, sessionExercise, [
              buildNotationAnalysisRow(
                "Attempt",
                sessionExercise.expectedOnsetsMs,
                payload.loopTapsMs[0],
                result,
              ),
            ]);
            setTapStatus(
              "Completed. Recorded " +
                payload.loopTapsMs[0].length +
                " taps. Rank " +
                arcadeSummary.rank +
                ". Score " +
                formatArcadeScore(arcadeSummary.finalScore) +
                ". Chain x" +
                arcadeSummary.rhythmSetChain +
                ".",
            );
            setStatus("Ready");
            setPostRunActionsMode("results");
            addSessionLogEntry({
              attemptNumber: attemptNumber,
              level: sessionExercise.level,
              loops: loops,
              tempoBpm: sessionExercise.tempoBpm,
              accuracy: result.overallAccuracy,
              taps: recordedTaps,
              missed: result.missedCount,
              extra: result.extraTapCount,
              status: "completed",
            });
            return;
          }

          const challenge = gradeChallenge(sessionExercise.expectedOnsetsMs, payload.loopTapsMs);
          appState.loopResults = challenge.loopResults;
          const totalMissed = challenge.loopResults.reduce(function (sum, item) {
            return sum + item.missedCount;
          }, 0);
          const totalExtra = challenge.loopResults.reduce(function (sum, item) {
            return sum + item.extraTapCount;
          }, 0);
          renderNotation(
            ui.notationContainer,
            sessionExercise,
            challenge.loopResults.map(function (loopResult, loopIndex) {
              return buildNotationAnalysisRow(
                "Loop " + (loopIndex + 1),
                sessionExercise.expectedOnsetsMs,
                payload.loopTapsMs[loopIndex],
                loopResult,
              );
            }),
          );

          renderSummaryCards(
            ui.summaryCards,
            {
              overallAccuracy: challenge.averageScore,
              timingLabel: "mixed",
              missedCount: totalMissed,
              extraTapCount: totalExtra,
            },
            "Challenge Avg",
          );
          const arcadeSummary = finalizeArcadeSession({
            accuracy: challenge.averageScore,
            missed: totalMissed,
            extra: totalExtra,
            rhythmId: sessionRhythmId,
          });
          appendArcadeSummaryCards(ui.summaryCards, arcadeSummary);

          renderLoopBreakdown(ui.loopBreakdown, challenge.loopResults, challenge.averageScore);
          setTapStatus(
              "Challenge complete. Rank " +
              arcadeSummary.rank +
              ". Score " +
              formatArcadeScore(arcadeSummary.finalScore) +
              ". Chain x" +
              arcadeSummary.rhythmSetChain +
              ".",
          );
          setPostRunActionsMode("results");
          addSessionLogEntry({
            attemptNumber: attemptNumber,
            level: sessionExercise.level,
            loops: loops,
            tempoBpm: sessionExercise.tempoBpm,
            accuracy: challenge.averageScore,
            taps: recordedTaps,
            missed: totalMissed,
            extra: totalExtra,
            status: "completed",
          });
          setStatus("Ready");
        },
        onCancel: function (payload) {
          liveNoteFeedback.stopPlayhead();
          clearMissTimeouts();
          appState.loopTapSets = payload.loopTapsMs;
          appState.isSessionActive = false;
          setButtonsDisabled(false);
          setBeatIndicator(false, "Cancelled");
          setStatus("Cancelled");
          resetLiveTimingFeedback("Session cancelled");
          const recordedTaps = payload.loopTapsMs.reduce(function (sum, taps) {
            return sum + taps.length;
          }, 0);
          if (appState.arcade.gameOver) {
            setStatus("Game Over");
            setTapStatus("No lives left. Restart to continue.");
            setArcadeBanner("GAME OVER! PRESS RESTART", "bad");
            setPostRunActionsMode("gameover");
          } else {
            setTapStatus("Cancelled. Recorded " + recordedTaps + " taps.");
            setArcadeBanner("RUN CANCELLED", "bad");
            spawnArcadeFloat("RUN OVER", "bad", "lg");
            pulseArcadeShellClass("arcade-punish", 420);
            setPostRunActionsMode("results");
          }
          addSessionLogEntry({
            attemptNumber: attemptNumber,
            level: sessionExercise.level,
            loops: loops,
            tempoBpm: sessionExercise.tempoBpm,
            accuracy: null,
            taps: recordedTaps,
            missed: null,
            extra: null,
            status: "cancelled",
          });
        },
      });
    } catch (error) {
      liveNoteFeedback.stopPlayhead();
      clearMissTimeouts();
      appState.isSessionActive = false;
      setButtonsDisabled(false);
      setStatus("Error");
      setBeatIndicator(false, "Error");
      setTapStatus("Session failed: " + error.message);
      resetLiveTimingFeedback("Session failed");
      setArcadeBanner("SYSTEM ERROR", "bad");
      spawnArcadeFloat("ERROR", "bad", "lg");
      pulseArcadeShellClass("arcade-punish", 420);
      setPostRunActionsMode("results");
      addSessionLogEntry({
        attemptNumber: attemptNumber,
        level: sessionExercise.level,
        loops: loops,
        tempoBpm: sessionExercise.tempoBpm,
        accuracy: null,
        taps: totalTapCount,
        missed: null,
        extra: null,
        status: "error",
      });
    }
  }

  function cancelSession() {
    if (!appState.isSessionActive) {
      return;
    }
    if (appState.arcade.runState === "active" || appState.arcade.streamPhase !== "idle") {
      cancelArcadeStream("user");
      return;
    }
    timingEngine.cancel("user");
  }

  function installKeyboardCapture() {
    window.addEventListener("keydown", function (event) {
      const isEnter = event.code === "Enter" || event.code === "NumpadEnter";
      if (isEnter) {
        if (event.repeat || appState.isSessionActive) {
          return;
        }

        if (ui.gameOverModal && !ui.gameOverModal.hidden && ui.playAgainBtn) {
          event.preventDefault();
          ui.playAgainBtn.click();
          return;
        }

        if (ui.arcadeOverlay && !ui.arcadeOverlay.hidden && ui.overlayPrimaryBtn) {
          event.preventDefault();
          if (shouldIgnoreEnterShortcutTarget(event.target) && event.target !== ui.startLevelSelect) {
            return;
          }
          ui.overlayPrimaryBtn.click();
          return;
        }

        if (appState.arcade.gameOver) {
          event.preventDefault();
          handlePlayAgainAction();
          return;
        }

        if (shouldIgnoreEnterShortcutTarget(event.target)) {
          return;
        }
        return;
      }

      if (event.code !== "Space") {
        return;
      }
      const arcadeShouldTrap =
        appState.arcade.runState === "active" &&
        (appState.arcade.streamPhase === "count-in" || appState.arcade.streamPhase === "performing");
      if (arcadeShouldTrap || timingEngine.shouldTrapSpacebar()) {
        event.preventDefault();
      }

      if (event.repeat || appState.isSpaceHeld) {
        return;
      }
      appState.isSpaceHeld = true;
      const arcadeTapOpen =
        appState.arcade.runState === "active" && appState.arcade.streamPhase === "performing";
      if (arcadeTapOpen || timingEngine.isTapWindowOpen()) {
        metronome.tapFeedback();
      }

      const wasRecorded = arcadeTapOpen ? registerArcadeTap() : timingEngine.registerTap();
      if (wasRecorded) {
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", function (event) {
      if (event.code === "Space") {
        appState.isSpaceHeld = false;
      }
    });

    window.addEventListener("blur", function () {
      appState.isSpaceHeld = false;
    });
  }

  function wireControls() {
    ui.generateBtn.addEventListener("click", function () {
      setupArcadeLineQueue();
    });
    ui.startBtn.addEventListener("click", function () {
      startArcadeRun({ continueExisting: false });
    });
    ui.loopBtn.addEventListener("click", function () {
      startArcadeRun({ continueExisting: false });
    });
    ui.cancelBtn.addEventListener("click", cancelSession);
    ui.levelSelect.addEventListener("change", function (event) {
      syncSelectedLevel(event.target.value);
    });
    ui.tempoSlider.addEventListener("input", function (event) {
      applyTempoToExercise(event.target.value, "user");
    });
    ui.tempoInput.addEventListener("input", function (event) {
      applyTempoToExercise(event.target.value, "user");
    });
    if (ui.overlayTempoSlider) {
      ui.overlayTempoSlider.addEventListener("input", function (event) {
        applyTempoToExercise(event.target.value, "user");
      });
    }
    if (ui.overlayTempoInput) {
      ui.overlayTempoInput.addEventListener("input", function (event) {
        applyTempoToExercise(event.target.value, "user");
      });
    }
    ui.clickSoundSelect.addEventListener("change", function (event) {
      metronome.setSoundMode(event.target.value);
    });
    if (ui.toggleLogBtn) {
      ui.toggleLogBtn.addEventListener("click", function () {
        setSessionLogOpen(!appState.isLogOpen);
      });
    }
    if (ui.clearLogBtn) {
      ui.clearLogBtn.addEventListener("click", function () {
        clearSessionLog();
      });
    }
    if (ui.startLevelSelect) {
      ui.startLevelSelect.addEventListener("change", function (event) {
        syncSelectedLevel(event.target.value);
      });
    }
    if (ui.overlayPrimaryBtn) {
      ui.overlayPrimaryBtn.addEventListener("click", handleOverlayPrimaryAction);
    }
    if (ui.playAgainBtn) {
      ui.playAgainBtn.addEventListener("click", handlePlayAgainAction);
    }
  }

  function init() {
    populateLevelSelector();
    metronome.setSoundMode(ui.clickSoundSelect.value);
    appState.arcade.bestScore = safeGetArcadeBestScore();
    applyTempoToExercise(ui.overlayTempoInput?.value || ui.tempoInput?.value || 90, "system");
    resetArcadeProfileState();
    installArcadeDebugHooks();
    wireControls();
    installKeyboardCapture();
    installArcadeErrorCapture();
    setButtonsDisabled(true);
    refreshSessionLogVisibility();
    setSessionLogOpen(false);
    resetLiveTimingFeedback();
    openTitleScreen();
  }

  init();
})();
