const PPQ = 480;

const TICKS_BY_DURATION = {
  w: PPQ * 4,
  h: PPQ * 2,
  q: PPQ,
  8: PPQ / 2,
  16: PPQ / 4,
};

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

function assertVexFlow() {
  if (!window.Vex || !window.Vex.Flow) {
    throw new Error("VexFlow is not available.");
  }
  return window.Vex.Flow;
}

function toVexDuration(token) {
  return `${token.durationCode}${token.isRest ? "r" : ""}`;
}

function splitByMeasure(tokens, measuresPerExercise, measureTicks) {
  const grouped = Array.from({ length: measuresPerExercise }, () => []);
  tokens.forEach((token, tokenIndex) => {
    const measureIndex = Math.floor(token.beatStartTicks / measureTicks);
    grouped[measureIndex].push({ token, tokenIndex });
  });
  return grouped;
}

function renderFallback(container, message) {
  container.innerHTML = `<p style="padding:12px;color:#7f2d2d;">${message}</p>`;
}

function getBeamGroups(VF, timeSignature) {
  const { num, den } = timeSignature;

  if (den === 4) {
    return Array.from({ length: num }, () => new VF.Fraction(1, 4));
  }

  if (num === 6 && den === 8) {
    return [new VF.Fraction(3, 8), new VF.Fraction(3, 8)];
  }

  if (num === 7 && den === 8) {
    return [new VF.Fraction(2, 8), new VF.Fraction(2, 8), new VF.Fraction(3, 8)];
  }

  if (den === 8) {
    return Array.from({ length: num }, () => new VF.Fraction(1, 8));
  }

  return [new VF.Fraction(1, den)];
}

function getBeatGroupTicks(timeSignature) {
  const { num, den } = timeSignature;

  if (den === 4) {
    return Array.from({ length: num }, () => PPQ);
  }

  if (num === 6 && den === 8) {
    return [PPQ + PPQ / 2, PPQ + PPQ / 2];
  }

  if (num === 7 && den === 8) {
    return [PPQ, PPQ, PPQ + PPQ / 2];
  }

  if (den === 8) {
    return Array.from({ length: num }, () => PPQ / 2);
  }

  return [(PPQ * 4 * num) / den];
}

function getBeatBoundaries(measureStartTick, measureTicks, timeSignature) {
  const groups = getBeatGroupTicks(timeSignature);
  const boundaries = [];
  let cursor = measureStartTick;

  groups.forEach((groupTicks) => {
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
    throw new Error(`Unable to decompose ${ticks} ticks into readable notation chunks.`);
  }

  return chunks;
}

function splitTokenAtBeatBoundaries(token, boundaries, measureEndTick) {
  const durationTicks = TICKS_BY_DURATION[token.durationCode];
  if (!durationTicks) {
    throw new Error(`Unsupported token duration: ${token.durationCode}`);
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

  measureTokens.forEach(({ token }) => {
    const slices = splitTokenAtBeatBoundaries(token, boundaries, measureEndTick);
    const exploded = [];

    slices.forEach((slice) => {
      const chunks = decomposeTicksToReadableValues(slice.ticks);
      let cursor = slice.startTick;

      chunks.forEach((chunk) => {
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

    exploded.forEach((chunkToken, idx) => {
      const isLast = idx === exploded.length - 1;
      chunkToken.tieToNext = !isLast || token.tieToNext;
      displayTokens.push(chunkToken);
    });
  });

  return displayTokens;
}

function hideFlagsForBeamedNotes(beams) {
  beams.forEach((beam) => {
    const beamNotes = typeof beam.getNotes === "function" ? beam.getNotes() : beam.notes;
    if (!beamNotes) {
      return;
    }

    beamNotes.forEach((note) => {
      if (note?.render_options && Object.hasOwn(note.render_options, "draw_flag")) {
        note.render_options.draw_flag = false;
      }
      if (typeof note?.setFlagStyle === "function") {
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

    if (VF.Dot?.buildAndAttach) {
      VF.Dot.buildAndAttach([staveNote], { all: true });
    }
  }
}

function getAnalysisDotColor(offsetMs) {
  if (offsetMs === null) {
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

function getAnalysisDotShiftPx(offsetMs) {
  const clamped = Math.max(-220, Math.min(220, offsetMs));
  return (clamped / 220) * 26;
}

function drawNotationAnalysisRows(container, onsetAnchors, analysisRows) {
  if (!Array.isArray(analysisRows) || analysisRows.length === 0 || onsetAnchors.length === 0) {
    return;
  }

  const svg = container.querySelector("svg");
  if (!svg) {
    return;
  }

  const svgNs = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(svgNs, "g");
  layer.setAttribute("class", "analysis-dots-layer");

  const baseY = Math.max(...onsetAnchors.map((anchor) => anchor.y)) + 24;
  const rowSpacing = 22;

  analysisRows.forEach((row, rowIndex) => {
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

    onsetAnchors.forEach((anchor, noteIndex) => {
      const offsetMs = row.offsetsMs[noteIndex] ?? null;

      if (offsetMs === null) {
        const miss = document.createElementNS(svgNs, "text");
        miss.setAttribute("x", String(anchor.x));
        miss.setAttribute("y", String(rowY + 3));
        miss.setAttribute("text-anchor", "middle");
        miss.setAttribute("font-size", "11");
        miss.setAttribute("font-family", "Space Grotesk, sans-serif");
        miss.setAttribute("fill", "#aa2e2e");
        miss.textContent = "X";
        layer.append(miss);
        return;
      }

      const dot = document.createElementNS(svgNs, "circle");
      dot.setAttribute("cx", String(anchor.x + getAnalysisDotShiftPx(offsetMs)));
      dot.setAttribute("cy", String(rowY));
      dot.setAttribute("r", "4.8");
      dot.setAttribute("fill", getAnalysisDotColor(offsetMs));
      dot.setAttribute("stroke", "#ffffff");
      dot.setAttribute("stroke-width", "0.8");
      dot.setAttribute("opacity", "0.94");
      dot.setAttribute("data-offset-ms", String(offsetMs));
      layer.append(dot);
    });
  });

  svg.append(layer);
}

export function renderNotation(container, exercise, analysisRows = []) {
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
  const height = 210 + (Array.isArray(analysisRows) ? analysisRows.length : 0) * 24;
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
  const onsetAnchors = [];

  groupedMeasures.forEach((measureTokens, measureIndex) => {
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
      stave.addTimeSignature(`${exercise.timeSignature.num}/${exercise.timeSignature.den}`);
    }

    stave.setContext(context).draw();

    const voice = new VF.Voice({
      num_beats: exercise.timeSignature.num,
      beat_value: exercise.timeSignature.den,
    });

    const noteMap = new Map();

    const notes = displayTokens.map((token, displayIndex) => {
      const staveNote = new VF.StaveNote({
        clef: "percussion",
        keys: ["c/5"],
        duration: toVexDuration(token),
      });

      applyDotsToNote(VF, staveNote, token.dots ?? 0);
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
    beams.forEach((beam) => beam.setContext(context).draw());

    displayTokens.forEach((token, localIndex) => {
      const previousToken = displayTokens[localIndex - 1];
      if (!token.isRest && !previousToken?.tieToNext) {
        const note = noteMap.get(localIndex);
        if (note) {
          const y = Array.isArray(note.getYs?.()) ? note.getYs()[0] : 90;
          onsetAnchors.push({
            x: note.getAbsoluteX(),
            y,
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

  tiesToDraw.forEach((tie) => tie.setContext(context).draw());
  drawNotationAnalysisRows(container, onsetAnchors, analysisRows);
}
