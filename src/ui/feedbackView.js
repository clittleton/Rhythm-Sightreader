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

export function clearFeedback({ summaryCardsEl, tableBodyEl, timelineEl, loopBreakdownEl }) {
  summaryCardsEl.innerHTML = "";
  tableBodyEl.innerHTML = "";
  timelineEl.innerHTML = "";
  loopBreakdownEl.innerHTML = "";
}

export function renderSummaryCards(summaryCardsEl, result, title = "Attempt") {
  summaryCardsEl.innerHTML = "";

  const cards = [
    { label: `${title} Score`, value: `${result.overallAccuracy}%` },
    { label: "Timing Bias", value: result.timingLabel },
    { label: "Missed Notes", value: String(result.missedCount) },
    { label: "Extra Taps", value: String(result.extraTapCount) },
  ];

  cards.forEach((card) => {
    const block = document.createElement("article");
    block.className = "summary-card";
    block.innerHTML = `<h3>${card.label}</h3><strong>${card.value}</strong>`;
    summaryCardsEl.append(block);
  });
}

export function renderLoopBreakdown(loopBreakdownEl, loopResults, averageScore) {
  loopBreakdownEl.innerHTML = "";
  const averageChip = document.createElement("div");
  averageChip.className = "loop-pill";
  averageChip.textContent = `4-loop average: ${averageScore}%`;
  loopBreakdownEl.append(averageChip);

  loopResults.forEach((result, index) => {
    const pill = document.createElement("div");
    pill.className = "loop-pill";
    pill.textContent = `Loop ${index + 1}: ${result.overallAccuracy}% (${result.timingLabel})`;
    loopBreakdownEl.append(pill);
  });
}

export function renderAttemptTable(tableBodyEl, expectedOnsetsMs, tapsMs, result) {
  tableBodyEl.innerHTML = "";

  expectedOnsetsMs.forEach((expected, noteIndex) => {
    const row = document.createElement("tr");
    const offset = result.tapOffsetsMs[noteIndex];
    const tapIndex = result.matchedTapIndices[noteIndex];
    const actual = tapIndex === -1 ? null : tapsMs[tapIndex];

    row.className = scoreClassFromOffset(offset);
    row.innerHTML = `
      <td>${noteIndex + 1}</td>
      <td>${expected}</td>
      <td>${actual === null ? "-" : actual}</td>
      <td>${offset === null ? "Miss" : offset}</td>
      <td>${timingWord(offset)}</td>
    `;

    tableBodyEl.append(row);
  });
}

export function renderTimeline(timelineEl, result) {
  timelineEl.innerHTML = "";

  result.tapOffsetsMs.forEach((offset, idx) => {
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.setAttribute("aria-label", `Note ${idx + 1}`);

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
    dot.className = `timeline-dot ${timelineClass(offset)}`;
    const clampedOffset = Math.max(-220, Math.min(220, offset));
    const left = 50 + (clampedOffset / 220) * 45;
    dot.style.left = `${left}%`;
    dot.title = `${offset} ms`;
    row.append(dot);

    timelineEl.append(row);
  });
}
