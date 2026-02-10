const MISS_COST = 160;
const EXTRA_COST = 120;
const MISSED_NOTE_PENALTY = 8;
const EXTRA_TAP_PENALTY = 5;

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

export function alignTapsToExpected(expectedOnsetsMs, tapOnsetsMs) {
  const n = expectedOnsetsMs.length;
  const m = tapOnsetsMs.length;

  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Number.POSITIVE_INFINITY));
  const parent = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
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
        const candidate = current + MISS_COST;
        if (candidate < dp[i + 1][j]) {
          dp[i + 1][j] = candidate;
          parent[i + 1][j] = { prevI: i, prevJ: j, op: "miss" };
        }
      }

      if (j < m) {
        const candidate = current + EXTRA_COST;
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
  return { matchedTapIndices, extraTapIndices };
}

export function gradeAttempt(expectedOnsetsMs, tapOnsetsMs) {
  const { matchedTapIndices, extraTapIndices } = alignTapsToExpected(expectedOnsetsMs, tapOnsetsMs);

  const tapOffsetsMs = expectedOnsetsMs.map((expected, idx) => {
    const tapIndex = matchedTapIndices[idx];
    if (tapIndex === -1) {
      return null;
    }
    return Math.round(tapOnsetsMs[tapIndex] - expected);
  });

  const perNoteScore = tapOffsetsMs.map((offset) => scoreOffset(offset));
  const missedCount = matchedTapIndices.filter((idx) => idx === -1).length;
  const extraTapCount = extraTapIndices.length;
  const rawAverage = perNoteScore.reduce((sum, score) => sum + score, 0) / Math.max(perNoteScore.length, 1);
  const overallAccuracy = clamp(
    Math.round(rawAverage - missedCount * MISSED_NOTE_PENALTY - extraTapCount * EXTRA_TAP_PENALTY),
    0,
    100,
  );

  const matchedOffsets = tapOffsetsMs.filter((offset) => offset !== null);
  const meanOffset =
    matchedOffsets.length > 0
      ? matchedOffsets.reduce((sum, offset) => sum + offset, 0) / matchedOffsets.length
      : 0;

  let timingLabel = "on-time";
  if (meanOffset > 20) {
    timingLabel = "late";
  } else if (meanOffset < -20) {
    timingLabel = "early";
  }

  return {
    tapOffsetsMs,
    perNoteScore,
    overallAccuracy,
    timingLabel,
    missedCount,
    extraTapCount,
    matchedTapIndices,
    extraTapIndices,
    perNoteClass: tapOffsetsMs.map((offset) => classifyTiming(offset)),
  };
}

export function gradeChallenge(expectedOnsetsMs, loopTapsMs) {
  const loopResults = loopTapsMs.map((taps) => gradeAttempt(expectedOnsetsMs, taps));
  const averageScore =
    loopResults.reduce((sum, result) => sum + result.overallAccuracy, 0) / Math.max(loopResults.length, 1);

  return {
    loopResults,
    averageScore: Math.round(averageScore),
  };
}
