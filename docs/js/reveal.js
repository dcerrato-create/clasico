// reveal.js - the rivalry card: the two flags and the headline stats.
// It first plays the full-screen clash (clash.js). When the big flags have
// shrunk into this card, the numbers count up one after another.

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));
}

// Small helper: make an element with a class and (optional) text.
function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Animate a number from 0 up to target. Resolves when it finishes.
function countUp(el, target, duration = 900) {
  return new Promise((resolve) => {
    if (reducedMotion || target === 0) {
      el.textContent = target;
      resolve();
      return;
    }
    const start = performance.now();
    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // fast at first, slow at the end
      el.textContent = Math.round(target * eased);
      // Stop early if this element was removed (a new rivalry was picked).
      if (progress < 1 && el.isConnected) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = target;
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function buildSide(team, sideClass) {
  const side = makeEl("div", `side ${sideClass}`);
  side.append(createFlag(team), makeEl("span", "side-name", team.name));
  return side;
}

// One box of the record: a big number with a colored marker and a label.
function buildRecordItem(kind, label) {
  const item = makeEl("div", `record-item ${kind}`);
  const number = makeEl("span", "record-number", "0");
  item.append(number, makeEl("span", "record-label", label));
  return { item, number };
}

// Builds the reveal card inside `container` and plays the animation.
// teamColors = { a, b, draw } from pickTeamColors() in colors.js.
// quick = true plays a short clash inside the card instead of the full-screen one.
function renderReveal(container, data, teamColors, quick = false) {
  const { team_a: teamA, team_b: teamB, summary } = data;

  const card = makeEl("section", "card reveal");
  card.setAttribute("aria-label", `${teamA.name} versus ${teamB.name}`);

  // --- The stage: flag, clash, flag ---
  // "pending" hides the small flags until the big ones land on them.
  const stage = makeEl("div", "stage pending");
  const sideA = buildSide(teamA, "side-a");
  const sideB = buildSide(teamB, "side-b");
  stage.append(sideA, makeEl("div", "stage-vs", "VS"), sideB);
  card.append(stage);

  // Plays the clash, then shows the small flags in the card.
  async function clashThenShow() {
    if (quick) {
      // Quick version: the small flags slide in and bump (CSS, ".stage.quick").
      stage.classList.replace("pending", "quick");
      await wait(1000);
      return;
    }
    await playClash(teamA, teamB, teamColors, {
      a: sideA.querySelector(".flag"),
      b: sideB.querySelector(".flag"),
    });
    stage.classList.remove("pending");
  }

  // --- Teams that never met: flags plus a friendly note, no stats ---
  if (summary.total_matches === 0) {
    const note = makeEl("p", "never-met",
      `${teamA.name} and ${teamB.name} have never played each other.`);
    const hint = makeEl("p", "never-met-hint", "Try another pair, or one of the featured rivalries below.");
    card.append(note, hint);
    container.append(card);
    clashThenShow();
    return;
  }

  // --- Headline stats ---
  const headline = makeEl("div", "headline");

  const total = makeEl("p", "total step");
  const totalNumber = makeEl("span", "total-number", "0");
  total.append(totalNumber, makeEl("span", "total-label", summary.total_matches === 1 ? "match" : "matches"));

  const record = makeEl("div", "record step");
  const a = buildRecordItem("a", `${teamA.name} wins`);
  const d = buildRecordItem("d", "Draws");
  const b = buildRecordItem("b", `${teamB.name} wins`);
  record.append(a.item, d.item, b.item);

  // A bar split in three, sized by the share of each result.
  const bar = makeEl("div", "record-bar step");
  bar.setAttribute("aria-hidden", "true");
  for (const [kind, count] of [["a", summary.a_wins], ["d", summary.draws], ["b", summary.b_wins]]) {
    if (count === 0) continue;
    const segment = makeEl("span", `segment ${kind}`);
    segment.style.flexGrow = count;
    bar.append(segment);
  }

  const goals = makeEl("p", "goals step");
  const goalsNumber = makeEl("strong", "", "0");
  goals.append(
    goalsNumber,
    ` total goals · ${teamA.name} ${summary.a_goals} – ${summary.b_goals} ${teamB.name}`
  );

  const firstYear = summary.first_match.date.slice(0, 4);
  const latestYear = summary.latest_match.date.slice(0, 4);
  let extraText = `First meeting ${firstYear} · Latest ${latestYear}`;
  if (summary.shootouts.total > 0) {
    const s = summary.shootouts;
    extraText += ` · ${s.total} penalty shootout${s.total === 1 ? "" : "s"} ` +
      `(${teamA.name} ${s.a_wins}, ${teamB.name} ${s.b_wins}), counted as draws`;
  }
  const extra = makeEl("p", "headline-extra step", extraText);

  headline.append(total, record, bar, goals, extra);
  card.append(headline);
  container.append(card);

  // --- Play the numbers in order, after the flags have clashed ---
  (async () => {
    await clashThenShow();
    await wait(150);
    total.classList.add("show");
    await countUp(totalNumber, summary.total_matches);
    record.classList.add("show");
    bar.classList.add("show");
    await Promise.all([
      countUp(a.number, summary.a_wins),
      countUp(d.number, summary.draws),
      countUp(b.number, summary.b_wins),
    ]);
    goals.classList.add("show");
    extra.classList.add("show");
    await countUp(goalsNumber, summary.total_goals);
  })();
}
