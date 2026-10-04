// story.js - the "AI Story" card: asks the backend for the paragraph,
// shows a "writing…" state while waiting, and has the EN/ES toggle.

const STORY_DISCLAIMER = "Written by AI from match data. AI can make mistakes; verify key facts.";

// Stories already fetched during this visit: "Argentina|Brazil|es" -> text.
// (The backend has its own permanent cache; this just avoids repeat requests.)
const storyMemo = new Map();

let storyLang = "en";     // the language the visitor last chose
let storyRequestId = 0;   // lets us ignore answers that arrive too late

function renderStory(container, data) {
  const teamA = data.team_a.name;
  const teamB = data.team_b.name;

  const card = makeEl("section", "card story");
  card.setAttribute("aria-labelledby", "story-heading");

  const head = makeEl("div", "story-head");
  const heading = makeEl("h2", "story-heading");
  heading.id = "story-heading";
  heading.append(makeEl("span", "ai-badge", "✦ AI"), "AI Story");

  const toggle = makeEl("div", "lang-toggle");
  toggle.setAttribute("role", "group");
  toggle.setAttribute("aria-label", "Story language");
  const buttons = {};
  for (const [lang, label, title] of [["en", "EN", "English"], ["es", "ES", "Español"]]) {
    const button = makeEl("button", "", label);
    button.type = "button";
    button.title = title;
    button.addEventListener("click", () => {
      storyLang = lang;
      load();
    });
    buttons[lang] = button;
    toggle.append(button);
  }
  head.append(heading, toggle);

  const text = makeEl("p", "story-text");
  text.setAttribute("aria-live", "polite");
  const disclaimer = makeEl("p", "story-disclaimer", STORY_DISCLAIMER);

  card.append(head, text, disclaimer);
  container.append(card);

  async function load() {
    for (const [lang, button] of Object.entries(buttons)) {
      button.setAttribute("aria-pressed", String(lang === storyLang));
    }
    const lang = storyLang;
    const memoKey = [teamA, teamB].sort().join("|") + "|" + lang;
    const requestId = ++storyRequestId;

    text.className = "story-text";
    text.lang = lang;
    if (storyMemo.has(memoKey)) {
      text.textContent = storyMemo.get(memoKey);
      return;
    }

    // Loading state
    text.classList.add("writing");
    text.textContent = lang === "es" ? "escribiendo" : "writing";

    try {
      const answer = await apiPost("/api/story", { team_a: teamA, team_b: teamB, lang });
      storyMemo.set(memoKey, answer.story);
      if (requestId !== storyRequestId || !card.isConnected) return; // stale answer
      text.className = "story-text";
      text.textContent = answer.story;
    } catch (err) {
      if (requestId !== storyRequestId || !card.isConnected) return;
      // Error state: the reason plus a button to try again.
      text.className = "story-text story-error";
      text.lang = "en";
      const retry = makeEl("button", "secondary", "Try again");
      retry.type = "button";
      retry.addEventListener("click", load);
      text.replaceChildren(err.message + " ", retry);
    }
  }

  load();
}
