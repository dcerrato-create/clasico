// Where the backend lives. Change this one line when the backend is deployed.
const BACKEND_URL = "http://127.0.0.1:5001";

/* ==========================================================================
   CONFIG - things you may want to edit yourself
   ========================================================================== */

// Colors used across the whole app (page, flags, stats and chart).
// teamA is always the team picked on the left, teamB the one on the right.
const COLORS = {
  teamA: "#4da3ff",       // left team (blue)
  teamB: "#ff9040",       // right team (orange)
  draw: "#a3adbb",        // draws (gray)
  accent: "#ffd54a",      // buttons and highlights (gold)
  background: "#0b1220",  // page background
  surface: "#141d2f",     // cards
  text: "#eef2f8",        // main text
  muted: "#95a1b5",       // secondary text
};

// Rivalries shown on the home screen. Names must match the dataset
// (for example "United States", not "USA").
const FEATURED_RIVALRIES = [
  { a: "Honduras", b: "El Salvador", tagline: "El Clásico Centroamericano" },
  { a: "Mexico", b: "United States", tagline: "El Clásico de la CONCACAF" },
  { a: "Argentina", b: "Brazil", tagline: "Superclásico de las Américas" },
];

/* ========================== end of CONFIG ================================ */
