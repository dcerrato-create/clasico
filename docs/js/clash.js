// clash.js - the full-screen cinematic flag clash.
//
// What happens, in order (the looks are in style.css under "Cinematic clash"):
//   1. CHARGE  - the screen goes dark and two huge flags fly in from the sides.
//   2. IMPACT  - they hit: white flash, shockwaves, sparks, the screen shakes
//                and "VS" slams in.
//   3. SETTLE  - the flags shrink and fly down into the small flags in the
//                card, and the overlay fades away.
// Clicking or tapping anywhere skips straight to step 3.

// Draws the sparks on a canvas: each spark is a short streak that flies out
// from the middle, slows down, falls and fades.
function burstSparks(canvas, sparkColors) {
  const width = (canvas.width = window.innerWidth);
  const height = (canvas.height = window.innerHeight);
  const ctx = canvas.getContext("2d");
  const sparks = [];

  for (let i = 0; i < CLASH.sparks; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 22;
    sparks.push({
      x: width / 2,
      y: height / 2,
      vx: Math.cos(angle) * speed * 1.4, // a bit wider than tall
      vy: Math.sin(angle) * speed - 3,
      size: 1 + Math.random() * 3,
      life: 1,                               // 1 = new, 0 = gone
      fade: 0.012 + Math.random() * 0.02,    // how fast it fades each frame
      color: sparkColors[i % sparkColors.length],
    });
  }

  function frame() {
    if (!canvas.isConnected) return; // overlay was removed: stop drawing
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    let alive = 0;
    for (const s of sparks) {
      if (s.life <= 0) continue;
      alive++;
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.96;   // air resistance
      s.vy = s.vy * 0.96 + 0.45; // gravity
      s.life -= s.fade;
      ctx.globalAlpha = Math.max(s.life, 0);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 2.2, s.y - s.vy * 2.2); // the streak behind it
      ctx.stroke();
    }
    if (alive > 0) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function buildClashFlag(team, sideClass) {
  const wrap = makeEl("div", `clash-flag ${sideClass}`);
  wrap.append(createFlag(team), makeEl("span", "clash-name", team.name));
  return wrap;
}

// Plays the clash. `targets` are the small flags in the card ({ a, b }) that
// the big flags shrink into. Returns a Promise that resolves when it's over.
async function playClash(teamA, teamB, teamColors, targets) {
  if (!CLASH.enabled || reducedMotion) return;

  // --- Build the overlay ---
  const overlay = makeEl("div", "clash-overlay");
  overlay.style.setProperty("--team-a", teamColors.a);
  overlay.style.setProperty("--team-b", teamColors.b);
  overlay.style.setProperty("--charge-time", `${CLASH.chargeTime}ms`);
  overlay.setAttribute("aria-hidden", "true");

  const shaker = makeEl("div", "clash-shaker"); // everything that shakes on impact
  const flagA = buildClashFlag(teamA, "a");
  const flagB = buildClashFlag(teamB, "b");
  shaker.append(
    makeEl("div", "clash-glow a"), makeEl("div", "clash-glow b"),
    makeEl("div", "clash-starburst"), makeEl("div", "clash-flare"),
    makeEl("div", "clash-ring"), makeEl("div", "clash-ring second"), makeEl("div", "clash-ring third"),
    flagA, flagB, makeEl("div", "clash-vs", "VS")
  );

  const sparks = document.createElement("canvas");
  sparks.className = "clash-sparks";

  overlay.append(
    makeEl("div", "clash-backdrop"), shaker, sparks,
    makeEl("div", "clash-flash"),
    makeEl("div", "clash-bar top"), makeEl("div", "clash-bar bottom"),
    makeEl("div", "clash-skip", "Tap to skip")
  );
  document.body.append(overlay);

  // Clicking, tapping or pressing a key skips ahead.
  let skip;
  const skipped = new Promise((resolve) => (skip = resolve));
  overlay.addEventListener("click", skip);
  document.addEventListener("keydown", skip, { once: true });
  // Don't let the page scroll behind the overlay.
  const blockScroll = (event) => event.preventDefault();
  overlay.addEventListener("wheel", blockScroll, { passive: false });
  overlay.addEventListener("touchmove", blockScroll, { passive: false });

  const pause = (ms) => Promise.race([new Promise((r) => setTimeout(r, ms)), skipped]);

  // --- 1. CHARGE ---
  overlay.classList.add("charge");
  await pause(CLASH.chargeTime);

  // --- 2. IMPACT ---
  overlay.classList.remove("charge");
  overlay.classList.add("impact");
  burstSparks(sparks, [teamColors.a, teamColors.b, "#ffffff"]);
  await pause(CLASH.holdTime);

  // --- 3. SETTLE: shrink each big flag into its small flag in the card ---
  // Measure where every flag is now and where it has to go...
  const moves = [[flagA, targets.a], [flagB, targets.b]].map(([big, small]) => ({
    big,
    from: big.getBoundingClientRect(),
    to: small.getBoundingClientRect(),
  }));
  // ...stop the shaking and zooming...
  overlay.style.setProperty("--shrink-time", `${CLASH.shrinkTime}ms`);
  overlay.classList.remove("impact");
  overlay.classList.add("settle");
  for (const { big, from, to } of moves) {
    // ...pin each big flag exactly where it was...
    big.classList.add("flying");
    Object.assign(big.style, {
      left: `${from.left}px`, top: `${from.top}px`,
      width: `${from.width}px`, height: `${from.height}px`,
      transitionDuration: `${CLASH.shrinkTime}ms`,
    });
    big.getBoundingClientRect(); // make the browser register the start position
    // ...then let it slide and shrink onto the small flag.
    Object.assign(big.style, {
      left: `${to.left}px`, top: `${to.top}px`,
      width: `${to.width}px`, height: `${to.height}px`,
    });
  }
  await new Promise((r) => setTimeout(r, CLASH.shrinkTime));

  document.removeEventListener("keydown", skip);
  overlay.remove();
}
