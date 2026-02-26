import assert from "node:assert/strict";

import { LEVELS } from "../src/config/levels.js";
import { gradeAttempt, gradeChallenge } from "../src/core/grader.js";
import {
  DURATION_TICKS,
  generateExercise,
  getMeasureTicks,
  parseTimeSignature,
  validateGeneratedExercise,
} from "../src/core/rhythmGenerator.js";

function validateGeneration() {
  for (const levelConfig of Object.values(LEVELS)) {
    for (let i = 0; i < 1000; i += 1) {
      const exercise = generateExercise(levelConfig);
      const result = validateGeneratedExercise(exercise, levelConfig);
      assert.equal(result.ok, true, `Level ${levelConfig.id} invalid: ${result.reason}`);
      assert.equal(
        exercise.expectedOnsetsMs.length > 0,
        true,
        `Level ${levelConfig.id} generated an exercise without playable onsets`,
      );

      const allowed = new Set(levelConfig.allowedDurations);
      exercise.notes.forEach((token) => {
        const fullCode = `${token.durationCode}${token.isRest ? "r" : ""}`;
        const allowedBaseRest = `${token.durationCode}r`;
        assert.equal(
          allowed.has(fullCode) || (token.isRest && allowed.has(allowedBaseRest)),
          true,
          `Level ${levelConfig.id} emitted forbidden duration ${fullCode}`,
        );
      });

      const meterTicks = getMeasureTicks(parseTimeSignature(`${exercise.timeSignature.num}/${exercise.timeSignature.den}`));
      for (let measure = 0; measure < exercise.measuresPerExercise; measure += 1) {
        const start = measure * meterTicks;
        const end = start + meterTicks;
        const notesInMeasure = exercise.notes.filter(
          (token) => token.beatStartTicks >= start && token.beatStartTicks < end,
        );
        const ticks = notesInMeasure
          .reduce((sum, token) => sum + DURATION_TICKS[token.durationCode], 0);
        assert.equal(ticks, meterTicks, `Level ${levelConfig.id} measure ${measure + 1} tick mismatch`);
        assert.equal(
          notesInMeasure.some((token) => !token.isRest),
          true,
          `Level ${levelConfig.id} measure ${measure + 1} generated only rests`,
        );
      }
    }
  }
}

function validateGrading() {
  const expected = [0, 500, 1000, 1500, 2000];
  const taps = [-120, 440, 1000, 1560, 2120];
  const result = gradeAttempt(expected, taps);

  assert.deepEqual(result.tapOffsetsMs, [-120, -60, 0, 60, 120]);
  assert.equal(result.perNoteScore[0], 30);
  assert.equal(result.perNoteScore[1], 70);
  assert.equal(result.perNoteScore[2], 100);
  assert.equal(result.perNoteScore[3], 70);
  assert.equal(result.perNoteScore[4], 30);

  const missExtra = gradeAttempt([0, 500, 1000], [0, 300, 500, 1300]);
  assert.equal(missExtra.missedCount >= 1, true);
  assert.equal(missExtra.extraTapCount >= 1, true);
}

function validateLoopScoring() {
  const expected = [0, 500, 1000, 1500];
  const loopTaps = [
    [0, 500, 1000, 1500],
    [20, 530, 980, 1480],
    [-80, 420, 930, 1610],
    [130, 600, 1000, 1700],
  ];

  const challenge = gradeChallenge(expected, loopTaps);
  assert.equal(challenge.loopResults.length, 4);

  const arithmeticMean = Math.round(
    challenge.loopResults.reduce((sum, loopResult) => sum + loopResult.overallAccuracy, 0) /
      challenge.loopResults.length,
  );

  assert.equal(challenge.averageScore, arithmeticMean);
}

validateGeneration();
validateGrading();
validateLoopScoring();

console.log("All core tests passed.");
