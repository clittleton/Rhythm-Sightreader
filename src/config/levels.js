export const LEVELS = {
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

export function getLevelConfig(levelId) {
  const level = LEVELS[levelId];
  if (!level) {
    throw new Error(`Unknown level: ${levelId}`);
  }
  return level;
}

export function listLevelIds() {
  return Object.keys(LEVELS).map((value) => Number(value));
}
