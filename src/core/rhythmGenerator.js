export const PPQ = 480;

export const DURATION_TICKS = {
  w: PPQ * 4,
  h: PPQ * 2,
  q: PPQ,
  8: PPQ / 2,
  16: PPQ / 4,
};

const REST_SUFFIX = "r";
const MAX_GENERATION_ATTEMPTS = 240;

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseDurationCode(durationCode) {
  const isRest = durationCode.endsWith(REST_SUFFIX);
  const base = isRest ? durationCode.slice(0, -1) : durationCode;
  const ticks = DURATION_TICKS[base];
  if (!ticks) {
    throw new Error(`Unsupported duration code: ${durationCode}`);
  }
  return { base, ticks, isRest };
}

function weightedChoice(candidates) {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = Math.random() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1];
}

export function parseTimeSignature(signature) {
  const [numText, denText] = signature.split("/");
  const num = Number(numText);
  const den = Number(denText);

  if (!Number.isFinite(num) || !Number.isFinite(den)) {
    throw new Error(`Invalid time signature: ${signature}`);
  }

  return { num, den };
}

export function getMeasureTicks(timeSignature) {
  return (PPQ * 4 * timeSignature.num) / timeSignature.den;
}

function chooseTimeSignature(levelConfig) {
  const options = levelConfig.allowedTimeSignatures;
  return parseTimeSignature(options[randomIntInclusive(0, options.length - 1)]);
}

function chooseTempo(levelConfig) {
  return randomIntInclusive(levelConfig.tempoRange.min, levelConfig.tempoRange.max);
}

function buildCandidates({ levelConfig, timeSignature, remainingTicks, cursorInMeasure, previousToken }) {
  const candidates = [];
  const beatTicks = (PPQ * 4) / timeSignature.den;

  for (const durationCode of levelConfig.allowedDurations) {
    const parsed = parseDurationCode(durationCode);
    if (parsed.ticks > remainingTicks) {
      continue;
    }

    let weight = levelConfig.durationWeights[durationCode] ?? levelConfig.durationWeights[parsed.base] ?? 1;

    if (parsed.isRest && previousToken?.isRest) {
      weight *= 0.35;
    }

    // Keep long values primarily on beat boundaries.
    if (parsed.ticks >= PPQ && cursorInMeasure % beatTicks !== 0) {
      weight *= 0.45;
    }

    // In compound meter, lean toward 8ths for a dotted feel.
    if (timeSignature.num === 6 && timeSignature.den === 8) {
      if (parsed.base === "8") {
        weight *= 1.45;
      }
      if (parsed.base === "16") {
        weight *= 0.8;
      }
    }

    // Level 5 should include more 16th activity.
    if (levelConfig.id >= 5 && parsed.base === "16") {
      weight *= 1.4;
    }

    if (weight > 0) {
      candidates.push({
        durationCode: parsed.base,
        isRest: parsed.isRest,
        ticks: parsed.ticks,
        weight,
      });
    }
  }

  return candidates;
}

function crossesBeatBoundary(tokenStartInMeasure, tokenTicks) {
  const beatTicks = PPQ;
  const startOffset = tokenStartInMeasure % beatTicks;
  const endOffset = (tokenStartInMeasure + tokenTicks) % beatTicks;
  const startsOffBeat = startOffset !== 0;
  const landsOnBeat = endOffset === 0;
  return startsOffBeat && landsOnBeat;
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
    const previousToken = tokens[tokens.length - 1] ?? null;
    const candidates = buildCandidates({
      levelConfig,
      timeSignature,
      remainingTicks,
      cursorInMeasure,
      previousToken,
    });

    if (candidates.length === 0) {
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
    applySyncopationWithinMeasure(tokens, measureStartTick, levelConfig.syncopationRate ?? 0.2);
  }

  if (!tokens.some((token) => !token.isRest)) {
    throw new Error("Generated silent measure.");
  }

  return tokens;
}

export function buildExpectedOnsetsMs(tokens, tempoBpm) {
  const msPerTick = (60000 / tempoBpm) / PPQ;
  const onsets = [];

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    const previous = tokens[idx - 1];
    if (token.isRest) {
      continue;
    }
    if (previous?.tieToNext) {
      continue;
    }
    onsets.push(Math.round(token.beatStartTicks * msPerTick));
  }

  return onsets;
}

export function getExerciseDurationMs(tokens, tempoBpm) {
  if (tokens.length === 0) {
    return 0;
  }
  const last = tokens[tokens.length - 1];
  const lastDurationTicks = DURATION_TICKS[last.durationCode];
  const totalTicks = last.beatStartTicks + lastDurationTicks;
  const msPerTick = (60000 / tempoBpm) / PPQ;
  return Math.round(totalTicks * msPerTick);
}

export function validateGeneratedExercise(exercise, levelConfig) {
  const measureTicks = exercise.measureTicks;
  const timeSig = exercise.timeSignature;
  const allowed = new Set(levelConfig.allowedDurations);

  for (let m = 0; m < exercise.measuresPerExercise; m += 1) {
    const measureStart = m * measureTicks;
    const measureEnd = measureStart + measureTicks;

    const notes = exercise.notes.filter(
      (token) => token.beatStartTicks >= measureStart && token.beatStartTicks < measureEnd,
    );

    const sumTicks = notes.reduce((sum, token) => sum + DURATION_TICKS[token.durationCode], 0);
    if (sumTicks !== measureTicks) {
      return {
        ok: false,
        reason: `Measure ${m + 1} sums to ${sumTicks} ticks instead of ${measureTicks}`,
      };
    }

    if (!notes.some((token) => !token.isRest)) {
      return {
        ok: false,
        reason: `Measure ${m + 1} contains only rests.`,
      };
    }

    for (let idx = 0; idx < notes.length; idx += 1) {
      const token = notes[idx];
      const code = `${token.durationCode}${token.isRest ? "r" : ""}`;
      if (!allowed.has(code) && !(token.isRest && allowed.has(`${token.durationCode}r`))) {
        return {
          ok: false,
          reason: `Duration ${code} is not allowed for level ${levelConfig.id}`,
        };
      }

      if (token.tieToNext) {
        const next = notes[idx + 1];
        if (!next || token.isRest || next.isRest) {
          return {
            ok: false,
            reason: "Tie points to invalid token in measure.",
          };
        }
      }
    }
  }

  if (exercise.timeSignature.num !== timeSig.num || exercise.timeSignature.den !== timeSig.den) {
    return { ok: false, reason: "Time signature mismatch." };
  }

  if (!exercise.expectedOnsetsMs.length) {
    return { ok: false, reason: "Exercise has no playable onsets." };
  }

  return { ok: true };
}

export function generateExercise(levelConfig) {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const timeSignature = chooseTimeSignature(levelConfig);
    const tempoBpm = chooseTempo(levelConfig);
    const measureTicks = getMeasureTicks(timeSignature);

    let notes = [];

    try {
      for (let measure = 0; measure < levelConfig.measuresPerExercise; measure += 1) {
        const measureStartTick = measure * measureTicks;
        const generated = generateMeasure(levelConfig, timeSignature, measureStartTick, measureTicks);
        notes = notes.concat(generated);
      }
    } catch {
      continue;
    }

    const expectedOnsetsMs = buildExpectedOnsetsMs(notes, tempoBpm);
    const exercise = {
      level: levelConfig.id,
      timeSignature,
      tempoBpm,
      notes,
      expectedOnsetsMs,
      measureTicks,
      measuresPerExercise: levelConfig.measuresPerExercise,
      totalDurationMs: getExerciseDurationMs(notes, tempoBpm),
    };

    const validation = validateGeneratedExercise(exercise, levelConfig);
    if (validation.ok) {
      return exercise;
    }
  }

  throw new Error("Failed to generate a valid exercise after multiple attempts.");
}
