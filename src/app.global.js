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

  function generateExercise(levelConfig) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const timeSignature = chooseTimeSignature(levelConfig);
      const tempoBpm = chooseTempo(levelConfig);
      const measureTicks = getMeasureTicks(timeSignature);
      let notes = [];

      try {
        for (let measure = 0; measure < levelConfig.measuresPerExercise; measure += 1) {
          const measureStartTick = measure * measureTicks;
          notes = notes.concat(
            generateMeasure(levelConfig, timeSignature, measureStartTick, measureTicks),
          );
        }
      } catch (error) {
        continue;
      }

      return {
        level: levelConfig.id,
        timeSignature: timeSignature,
        tempoBpm: tempoBpm,
        notes: notes,
        expectedOnsetsMs: buildExpectedOnsetsMs(notes, tempoBpm),
        measureTicks: measureTicks,
        measuresPerExercise: levelConfig.measuresPerExercise,
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
    const rawAverage =
      perNoteScore.reduce(function (sum, score) {
        return sum + score;
      }, 0) / Math.max(perNoteScore.length, 1);
    const overallAccuracy = clamp(Math.round(rawAverage - extraTapCount * 3), 0, 100);

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
    view.summaryCardsEl.innerHTML = "";
    view.tableBodyEl.innerHTML = "";
    view.timelineEl.innerHTML = "";
    view.loopBreakdownEl.innerHTML = "";
  }

  function renderSummaryCards(summaryCardsEl, result, title) {
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

  function renderNotation(container, exercise) {
    if (!exercise) {
      container.innerHTML = "";
      return;
    }

    let VF;
    try {
      VF = assertVexFlow();
    } catch (error) {
      renderFallback(container, error.message);
      return;
    }

    container.innerHTML = "";

    const width = Math.max(760, container.clientWidth || 760);
    const height = 210;
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();

    const groupedMeasures = splitByMeasure(
      exercise.notes,
      exercise.measuresPerExercise,
      exercise.measureTicks,
    );

    const leftPadding = 12;
    const measureGap = 10;
    const innerWidth = width - leftPadding * 2;
    const measureWidth =
      (innerWidth - measureGap * (exercise.measuresPerExercise - 1)) / exercise.measuresPerExercise;
    const tiesToDraw = [];

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
      const stave = new VF.Stave(staveX, 34, measureWidth);

      if (measureIndex === 0) {
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
      new VF.Formatter().joinVoices([voice]).format([voice], measureWidth - 24);
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
      this.audioContext = new AudioContextRef();
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

  Metronome.prototype.tick = function (accent) {
    const isAccent = !!accent;
    if (this.isToneReady && this.toneSynth) {
      const note = this.soundMode === "tick" ? (isAccent ? "G6" : "D6") : isAccent ? "F6" : "C6";
      const immediateTime =
        window.Tone && typeof window.Tone.immediate === "function"
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
      this.soundMode === "tick" ? (isAccent ? 1960 : 1480) : isAccent ? 1760 : 1320;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isAccent ? 0.18 : 0.12, now + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.018);
  };

  function TimingEngine(args) {
    this.metronome = args.metronome;
    this.state = "idle";
    this.session = null;
    this.timeouts = new Set();
  }

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

    const beatsPerMeasure = exercise.timeSignature.num;
    const beatMs = (60000 / exercise.tempoBpm) * (4 / exercise.timeSignature.den);
    const countInMs = beatsPerMeasure * beatMs;
    const singleLoopMs = exercise.totalDurationMs;
    const performanceMs = singleLoopMs * loops;
    const totalMs = countInMs + performanceMs;
    const sessionStart = performance.now();

    this.session = {
      loopTapsMs: Array.from({ length: loops }, function () {
        return [];
      }),
      loops: loops,
      singleLoopMs: singleLoopMs,
      latencyCompensationMs: latencyCompensationMs,
      performanceStart: null,
      performanceEnd: null,
      onTap: onTap,
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
    const loopIndex = Math.min(
      this.session.loops - 1,
      Math.floor(elapsedSincePerfStart / this.session.singleLoopMs),
    );
    const withinLoopMs = elapsedSincePerfStart - loopIndex * this.session.singleLoopMs;
    const compensatedTapMs = Math.round(withinLoopMs - this.session.latencyCompensationMs);
    this.session.loopTapsMs[loopIndex].push(compensatedTapMs);
    this.session.onTap({ loop: loopIndex + 1, withinLoopMs: compensatedTapMs });
    return true;
  };

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
  const timingEngine = new TimingEngine({ metronome: metronome });

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
    ui.beatIndicator.classList.toggle("active", !!active);
    ui.beatText.textContent = label;
  }

  function populateLevelSelector() {
    listLevelIds().forEach(function (levelId) {
      const option = document.createElement("option");
      option.value = String(levelId);
      option.textContent = "Level " + levelId;
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

    ui.timeSignatureValue.textContent = exercise.timeSignature.num + "/" + exercise.timeSignature.den;
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
    setTapStatus("Expected notes to hit: " + appState.exercise.expectedOnsetsMs.length);

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
    setTapStatus("Expected notes to hit: " + appState.exercise.expectedOnsetsMs.length);
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

  async function runSession(loops) {
    if (!appState.exercise) {
      generateNewExercise();
    }

    const sessionExercise = {
      ...appState.exercise,
      timeSignature: { ...appState.exercise.timeSignature },
      notes: appState.exercise.notes.map(function (note) {
        return { ...note };
      }),
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
        "Preparing audio and count-in... auto latency compensation " +
          latencyCompensationMs +
          " ms",
      );

      await timingEngine.start({
        exercise: sessionExercise,
        loops: loops,
        latencyCompensationMs: latencyCompensationMs,
        onStateChange: function (state) {
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
        onBeat: function (payload) {
          const phaseText = payload.phase === "count-in" ? "Count-in" : "Playing";
          setBeatIndicator(true, phaseText + ": beat " + payload.beatInMeasure);
        },
        onLoopStart: function (loopNumber) {
          if (loops > 1) {
            setTapStatus("Loop " + loopNumber + "/" + loops + " active. Press Space on each note.");
          } else {
            setTapStatus("Attempt active. Press Space on each note.");
          }
        },
        onTap: function (payload) {
          totalTapCount += 1;
          setTapStatus("Loop " + payload.loop + "/" + loops + " active. Total taps: " + totalTapCount);
        },
        onComplete: function (payload) {
          appState.loopTapSets = payload.loopTapsMs;
          setButtonsDisabled(false);
          setBeatIndicator(false, "Finished");

          if (loops === 1) {
            const result = gradeAttempt(sessionExercise.expectedOnsetsMs, payload.loopTapsMs[0]);
            appState.loopResults = [result];
            renderSummaryCards(ui.summaryCards, result, "Attempt");
            renderAttemptTable(
              ui.feedbackTableBody,
              sessionExercise.expectedOnsetsMs,
              payload.loopTapsMs[0],
              result,
            );
            renderTimeline(ui.timelineStrip, result);
            setTapStatus("Completed. Recorded " + payload.loopTapsMs[0].length + " taps.");
            setStatus("Ready");
            return;
          }

          const challenge = gradeChallenge(sessionExercise.expectedOnsetsMs, payload.loopTapsMs);
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
      setTapStatus("Session failed: " + error.message);
    }
  }

  function installKeyboardCapture() {
    window.addEventListener("keydown", function (event) {
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
    ui.tempoSlider.addEventListener("input", function (event) {
      applyTempoToExercise(event.target.value, "user");
    });
    ui.tempoInput.addEventListener("input", function (event) {
      applyTempoToExercise(event.target.value, "user");
    });
    ui.clickSoundSelect.addEventListener("change", function (event) {
      metronome.setSoundMode(event.target.value);
    });
  }

  function init() {
    populateLevelSelector();
    metronome.setSoundMode(ui.clickSoundSelect.value);
    wireControls();
    installKeyboardCapture();
    generateNewExercise();
  }

  init();
})();
