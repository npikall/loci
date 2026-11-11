import {
  MASTERY_STREAK,
  cardIds,
  cardStats,
  dayOf,
  dueDay,
  exportProgress,
  goTo,
  grade,
  importProgress,
  keyAction,
  move,
  newRound,
  overview,
  parseSaved,
  parseTheme,
  repeatMissed,
  resetProgress,
  roundProgress,
  sectionPaths,
  sections,
  summary,
  toggleFlag,
} from "/loci-core.js";

const STORAGE_KEY = "loci";
const THEME_KEY = "loci-theme";
const TOAST_MS = 2500;
const questions = [...document.querySelectorAll(".loci-question")];

function outlineNode(el) {
  if (el.matches(".loci-question")) return { question: true };
  return { level: Number(el.tagName[1]), text: el.textContent.trim() };
}

function readDeck() {
  const outline = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,.loci-question")].filter(
    (el) => el.matches(".loci-question") || !el.closest(".loci-question"),
  );
  const paths = sectionPaths(outline.map(outlineNode));
  const ids = cardIds(questions.map((el) => el.querySelector(".loci-prompt").innerHTML));
  return questions.map((el, i) => ({ id: ids[i], num: i + 1, section: paths[i], n: Number(el.dataset.n ?? 0) }));
}

const deck = readDeck();
const elementOf = new Map(deck.map((card, i) => [card.id, questions[i]]));
const cardOf = new Map(deck.map((card, i) => [questions[i], card]));
const numberOf = new Map(deck.map((card) => [card.id, card.num]));

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the session still works until reload.
  }
}

// `known` lets the next load tell new questions from ones the round left out.
const save = () => store(STORAGE_KEY, JSON.stringify({ ...state, known: deck.map((card) => card.id) }));

let state = parseSaved(readStored(STORAGE_KEY), deck);
let query = "";
const past = [];

const byId = (id) => document.getElementById(id);
const currentEntry = () => state.session.tape[state.session.pos];
const currentElement = () => elementOf.get(currentEntry()?.id);
const isCards = () => state.prefs.mode === "cards";
const isChoice = (el) => el.matches("form");

function isAnswered(el) {
  return isChoice(el) ? el.classList.contains("loci-checked") : el.querySelector(".loci-answer").open;
}

function shuffleOptions(form) {
  // Typst emits correct options first, so the order must not survive.
  const options = form.querySelector(".loci-options");
  for (let i = options.children.length; i > 1; i--) {
    options.append(options.children[Math.floor(Math.random() * i)]);
  }
}

function setVerdict(el, text = "", kind = "") {
  const verdict = el.querySelector(".loci-verdict");
  verdict.textContent = text;
  verdict.dataset.kind = kind;
}

function resetCard(el) {
  setVerdict(el);
  const tip = el.querySelector(".loci-tip");
  if (tip) tip.open = false;
  if (isChoice(el)) {
    el.classList.remove("loci-checked");
    el.reset();
    shuffleOptions(el);
  } else {
    el.querySelector(".loci-answer").open = false;
  }
}

const NEXT_BUTTON = `<button type="button" class="loci-next loci-primary" hidden>Next <kbd>Space</kbd></button>`;

function decorateHead(el) {
  const head = document.createElement("div");
  head.className = "loci-head";
  const crumb = document.createElement("span");
  crumb.className = "loci-crumb";
  crumb.textContent = cardOf.get(el).section;
  el.prepend(head);
  head.append(el.querySelector(".loci-label"), crumb);
  head.insertAdjacentHTML(
    "beforeend",
    `<button type="button" class="loci-flag" aria-pressed="false" title="Flag to come back to (F)">Flag</button>`,
  );
}

function decorateChoice(form) {
  const submit = form.querySelector("button[type=submit]");
  submit.classList.add("loci-primary");
  submit.insertAdjacentHTML("beforeend", " <kbd>Space</kbd>");
  form.querySelector(".loci-options").insertAdjacentHTML("afterend", `<div class="loci-verdict" role="status"></div>`);
  const actions = document.createElement("div");
  actions.className = "loci-actions";
  submit.before(actions);
  actions.append(submit);
  actions.insertAdjacentHTML("beforeend", NEXT_BUTTON);
}

function decorateRecall(el) {
  el.querySelector(".loci-answer > summary").innerHTML =
    `<span class="loci-closed">Show answer <kbd>Space</kbd></span><span class="loci-open">Answer</span>`;
  el.insertAdjacentHTML(
    "beforeend",
    `<div class="loci-verdict" role="status"></div>
     <div class="loci-actions">
       <div class="loci-rate" hidden>
         <button type="button" data-right="true">Knew it <kbd>1</kbd></button>
         <button type="button" data-right="false">Missed it <kbd>2</kbd></button>
       </div>
       ${NEXT_BUTTON}
     </div>`,
  );
}

function decorate(el) {
  decorateHead(el);
  if (isChoice(el)) decorateChoice(el);
  else decorateRecall(el);
  const tip = el.querySelector(".loci-tip > summary");
  if (tip) tip.insertAdjacentHTML("beforeend", " <kbd>I</kbd>");
  el.insertAdjacentHTML("beforeend", `<div class="loci-meta"></div>`);
}

const SHORTCUTS = [
  ["Space / Enter", "Reveal, check, then next"],
  ["1 – 9", "Pick an option"],
  ["1 / 2", "Knew it / Missed it"],
  ["I", "Open the hint"],
  ["F", "Flag the card"],
  ["← → or H L", "Previous / next card"],
  ["Home / End", "First / last card"],
  ["U", "Undo"],
  ["?", "This list"],
];

function buildInterface() {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<header class="loci-ui loci-bar">
       <div class="loci-heading">
         <strong id="loci-title"></strong>
         <span class="loci-seg">
           <button type="button" data-mode="cards">Cards</button>
           <button type="button" data-mode="list">List</button>
         </span>
         <details class="loci-menu" id="loci-menu">
           <summary aria-label="More" title="More">Menu</summary>
           <div class="loci-menu-items">
             <select id="loci-theme" aria-label="Theme">
               <option value="system">System theme</option>
               <option value="light">Light theme</option>
               <option value="dark">Dark theme</option>
             </select>
             <button type="button" id="loci-restart">Restart round</button>
             <button type="button" id="loci-shortcuts">Keyboard shortcuts</button>
             <button type="button" id="loci-export">Export progress</button>
             <button type="button" id="loci-import">Import progress</button>
             <button type="button" id="loci-reset" class="loci-danger">Reset progress</button>
             <input type="file" id="loci-file" accept="application/json,.json" hidden>
           </div>
         </details>
       </div>
       <div class="loci-overview">
         <div class="loci-meter" id="loci-meter" role="img">
           <span data-part="mastered"></span><span data-part="learning"></span>
         </div>
         <span id="loci-stats"></span>
       </div>
       <div class="loci-controls">
         <select id="loci-section" data-pref="section" aria-label="Section">
           <option value="*">All sections</option>
         </select>
         <select id="loci-filter" data-pref="filter" aria-label="Which questions">
           <option value="all">All questions</option>
           <option value="review">Due for review</option>
           <option value="due">Not mastered</option>
           <option value="missed">Last missed</option>
           <option value="new">New</option>
           <option value="flagged">Flagged</option>
         </select>
         <select id="loci-order" data-pref="order" aria-label="Order">
           <option value="document">Document order</option>
           <option value="shuffle">Shuffled</option>
           <option value="weakest">Weakest first</option>
           <option value="frequency">Most asked</option>
         </select>
         <input type="search" id="loci-search" class="loci-list-only" placeholder="Search questions" aria-label="Search questions">
         <button type="button" id="loci-reveal" class="loci-list-only">Reveal all</button>
       </div>
     </header>`,
  );
  document.body.insertAdjacentHTML(
    "beforeend",
    `<p class="loci-ui loci-empty loci-list-only" id="loci-empty" hidden>No questions match.</p>
     <section class="loci-ui loci-summary loci-cards-only" id="loci-summary" hidden>
       <div class="loci-label" id="loci-summary-title"></div>
       <p class="loci-score" id="loci-score"></p>
       <p id="loci-summary-text"></p>
       <div class="loci-actions">
         <button type="button" id="loci-repeat" class="loci-primary"></button>
         <button type="button" id="loci-again">New round <kbd>Space</kbd></button>
       </div>
     </section>
     <nav class="loci-ui loci-pager loci-cards-only" aria-label="Questions">
       <div class="loci-progress" id="loci-progress" role="progressbar" aria-label="Round progress" aria-valuemin="0"><span></span></div>
       <div class="loci-pager-row">
         <button type="button" id="loci-prev" title="Previous (←)" aria-label="Previous">←</button>
         <div id="loci-strip"></div>
         <button type="button" id="loci-next" title="Next (→)" aria-label="Next">→</button>
       </div>
       <div class="loci-pager-row loci-pager-info">
         <span id="loci-pos"></span>
         <button type="button" id="loci-undo" class="loci-link" title="Undo (U)">Undo</button>
         <button type="button" id="loci-help-open" class="loci-link" title="Keyboard shortcuts (?)">Shortcuts</button>
       </div>
     </nav>
     <dialog class="loci-ui loci-dialog" id="loci-help">
       <div class="loci-label">KEYBOARD SHORTCUTS</div>
       <dl>${SHORTCUTS.map(([keys, what]) => `<dt>${keys}</dt><dd>${what}</dd>`).join("")}</dl>
       <form method="dialog"><button>Close</button></form>
     </dialog>
     <div class="loci-ui loci-toast" id="loci-toast" role="status" hidden></div>`,
  );
  byId("loci-title").textContent = document.title || "loci";
  const names = sections(deck);
  byId("loci-section").append(...names.map((name) => new Option(name, name)));
  byId("loci-section").hidden = names.length === 0;
}

let toastTimer;

function toast(message) {
  const el = byId("loci-toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), TOAST_MS);
}

function paintControls() {
  const counts = overview(deck, state.history, state.reviewed);
  const total = Math.max(deck.length, 1);
  byId("loci-stats").textContent =
    `${counts.due} due · ${counts.mastered} mastered · ${counts.learning} learning · ${counts.new} new`;
  const meter = byId("loci-meter");
  meter.ariaLabel = `${counts.mastered} of ${deck.length} mastered`;
  for (const part of meter.children) part.style.width = `${(counts[part.dataset.part] / total) * 100}%`;
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.classList.toggle("loci-active", button.dataset.mode === state.prefs.mode);
  }
  for (const select of document.querySelectorAll("[data-pref]")) {
    select.value = state.prefs[select.dataset.pref];
  }
}

function reviewText(log, reviewedOn) {
  if (!log) return "not studied yet";
  const days = dueDay(log, reviewedOn) - dayOf();
  if (days <= 0) return "review due";
  return days === 1 ? "review tomorrow" : `review in ${days} days`;
}

function paintMeta(el, id) {
  const log = state.history[id];
  const { seen, missed, streak, status } = cardStats(log);
  const filled = Math.min(streak, MASTERY_STREAK);
  const chip = document.createElement("span");
  chip.className = "loci-chip";
  chip.dataset.status = status;
  chip.textContent = status;
  const dots = document.createElement("span");
  dots.className = "loci-dots";
  dots.title = `${streak} right in a row, ${MASTERY_STREAK} to master`;
  dots.textContent = "●".repeat(filled) + "○".repeat(MASTERY_STREAK - filled);
  const counts = seen === 0 ? "" : ` · seen ${seen} · missed ${missed}`;
  el.querySelector(".loci-meta").replaceChildren(chip, dots, `${reviewText(log, state.reviewed[id])}${counts}`);
}

function paintFlag(el, id) {
  const flagged = state.flags[id] === true;
  const button = el.querySelector(".loci-flag");
  button.ariaPressed = String(flagged);
  button.textContent = flagged ? "★ Flagged" : "☆ Flag";
}

const matchesQuery = (el) => query === "" || el.textContent.toLowerCase().includes(query);

function paintCard(card, listed) {
  const el = elementOf.get(card.id);
  const entry = currentEntry();
  const onScreen = isCards() && card.id === entry?.id;
  el.hidden = isCards() ? !onScreen : !(listed.has(card.id) && matchesQuery(el));
  const answered = isAnswered(el);
  const rate = el.querySelector(".loci-rate");
  if (rate) rate.hidden = !(onScreen && answered && entry.grade === null);
  el.querySelector(".loci-next").hidden = !(onScreen && answered && entry.grade !== null);
  paintMeta(el, card.id);
  paintFlag(el, card.id);
}

function summaryText() {
  const { cards, misses, skipped } = summary(state.session);
  if (cards === 0) return "No questions match. Change the section or the filter above.";
  return `${cards} cards · ${misses} wrong answers · ${skipped} skipped`;
}

function paintSummary() {
  const { tape, pos } = state.session;
  const { cards, firstTry, missed } = summary(state.session);
  byId("loci-summary").hidden = !isCards() || pos < tape.length;
  byId("loci-summary-title").textContent = cards === 0 ? "NOTHING TO STUDY" : "ROUND COMPLETE";
  byId("loci-score").hidden = cards === 0;
  byId("loci-score").textContent = `${firstTry} / ${cards} right first try`;
  byId("loci-summary-text").textContent = summaryText();
  byId("loci-repeat").hidden = missed.length === 0;
  byId("loci-repeat").innerHTML = `Repeat missed (${missed.length}) <kbd>Space</kbd>`;
  byId("loci-again").querySelector("kbd").hidden = missed.length > 0;
}

const GRADE_NAMES = { true: "right", false: "missed", null: "open" };

function stripCell({ id, grade: result }, index) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.dataset.pos = index;
  cell.dataset.grade = String(result);
  if (state.flags[id]) cell.dataset.flag = "";
  cell.textContent = numberOf.get(id);
  cell.title = `Question ${numberOf.get(id)} · ${GRADE_NAMES[result]}`;
  cell.classList.toggle("loci-active", index === state.session.pos);
  return cell;
}

function paintPager() {
  const { tape, pos } = state.session;
  const { done, total } = roundProgress(state.session);
  const strip = byId("loci-strip");
  strip.replaceChildren(...tape.map(stripCell));
  strip.querySelector(".loci-active")?.scrollIntoView({ block: "nearest", inline: "center" });
  const bar = byId("loci-progress");
  bar.ariaValueMax = total;
  bar.ariaValueNow = done;
  bar.firstElementChild.style.width = `${total === 0 ? 0 : (done / total) * 100}%`;
  byId("loci-pos").textContent = pos < tape.length ? `Card ${pos + 1} of ${tape.length}` : `Done · ${tape.length} cards`;
  byId("loci-prev").disabled = pos === 0;
  byId("loci-next").disabled = pos >= tape.length;
  byId("loci-undo").disabled = past.length === 0;
}

function paintList(listed) {
  const shown = questions.some((el) => !el.hidden);
  byId("loci-empty").hidden = isCards() || shown;
  byId("loci-empty").textContent =
    listed.size === 0 ? "No questions match. Change the section or the filter above." : "No question contains that text.";
}

function paint() {
  document.body.classList.toggle("loci-cards", isCards());
  document.body.classList.toggle("loci-list", !isCards());
  // Headings of sections without a hit would only be noise between results.
  document.body.classList.toggle("loci-searching", !isCards() && query !== "");
  const listed = new Set(state.session.tape.map((entry) => entry.id));
  for (const card of deck) paintCard(card, listed);
  paintControls();
  paintSummary();
  paintPager();
  paintList(listed);
}

/** Shows the current position fresh, so a repeat cannot be answered by memory of the screen. */
function enter() {
  const el = currentElement();
  if (el) resetCard(el);
  save();
  paint();
  if (isCards()) scrollTo({ top: 0 });
}

function navigate(session) {
  state = { ...state, session };
  enter();
}

/** Applies a change that Undo can take back. */
function commit(next) {
  if (next === state) return;
  past.push(state);
  state = next;
}

function changeRound(session) {
  commit({ ...state, session });
  enter();
}

function rate(right) {
  commit(grade(state, right));
  navigate(move(state.session, 1));
}

function undo() {
  if (past.length === 0) return;
  state = past.pop();
  enter();
}

function choiceVerdict(form) {
  const inputs = [...form.querySelectorAll("input")];
  const missed = inputs.filter((input) => input.value === "ok" && !input.checked).length;
  const wrong = inputs.filter((input) => input.value === "err" && input.checked).length;
  if (missed + wrong === 0) return { right: true, text: "✓ Correct" };
  const multiple = inputs[0].type === "checkbox";
  const parts = [missed && `${missed} missed`, wrong && `${wrong} wrong`].filter(Boolean);
  return { right: false, text: multiple ? `✗ Not quite · ${parts.join(" · ")}` : "✗ Not quite" };
}

function check(form) {
  if (!form.querySelector("input:checked")) {
    setVerdict(form, "Pick an answer first.", "note");
    return;
  }
  const { right, text } = choiceVerdict(form);
  form.classList.add("loci-checked");
  setVerdict(form, text, right ? "right" : "wrong");
  if (isCards()) commit(grade(state, right));
  save();
  paint();
}

function finish() {
  changeRound(summary(state.session).missed.length > 0 ? repeatMissed(state.session) : newRound(state, deck));
}

function revealAll() {
  const shown = questions.filter((el) => !el.hidden);
  const reveal = !shown.every(isAnswered);
  for (const el of shown) {
    if (isChoice(el)) el.classList.toggle("loci-checked", reveal);
    else el.querySelector(".loci-answer").open = reveal;
  }
  byId("loci-reveal").textContent = reveal ? "Hide all" : "Reveal all";
}

function setPref(key, value) {
  const next = { ...state, prefs: { ...state.prefs, [key]: value } };
  commit({ ...next, session: newRound(next, deck) });
  enter();
}

function setMode(mode) {
  state = { ...state, prefs: { ...state.prefs, mode } };
  enter();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  byId("loci-theme").value = theme;
  store(THEME_KEY, theme);
}

function flag(id) {
  if (!id) return;
  commit(toggleFlag(state, id));
  save();
  paint();
}

function toggleHint() {
  const tip = currentElement()?.querySelector(".loci-tip");
  if (tip) tip.open = !tip.open;
}

function resetAll() {
  if (!confirm("Delete all progress for this document? Undo works until you reload.")) return;
  commit(resetProgress(state, deck));
  enter();
}

function downloadProgress() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([exportProgress(state)], { type: "application/json" }));
  link.download = `${(document.title || "loci").replace(/[^\w-]+/g, "-")}.loci.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Progress exported");
}

async function restoreProgress(file) {
  if (!file) return;
  const restored = importProgress(state, await file.text(), deck);
  if (!restored) {
    toast("That file is not a loci progress export");
    return;
  }
  commit(restored);
  enter();
  toast("Progress imported · Undo takes it back");
}

const closeMenu = () => (byId("loci-menu").open = false);

const actions = {
  next: () => navigate(move(state.session, 1)),
  prev: () => navigate(move(state.session, -1)),
  first: () => navigate(goTo(state.session, 0)),
  last: () => navigate(goTo(state.session, state.session.tape.length - 1)),
  undo,
  finish,
  check: () => currentElement().requestSubmit(),
  reveal: () => {
    currentElement().querySelector(".loci-answer").open = true;
  },
  toggle: ({ index }) => currentElement().querySelector(".loci-options").children[index].querySelector("input").click(),
  grade: ({ right }) => rate(right),
  flag: () => flag(currentEntry()?.id),
  hint: toggleHint,
  help: () => byId("loci-help").showModal(),
};

function currentView() {
  const el = currentElement();
  if (!el) return { atEnd: true };
  return {
    atEnd: false,
    choice: isChoice(el),
    answered: isAnswered(el),
    graded: currentEntry().grade !== null,
    optionCount: el.querySelectorAll("input").length,
  };
}

function onKey(event) {
  const typing = event.target.closest?.("select, input:not([type=checkbox], [type=radio]), dialog");
  const ignored = event.metaKey || event.ctrlKey || event.altKey || typing || byId("loci-help").open;
  if (ignored || !isCards()) return;
  const action = keyAction(event.key, currentView());
  if (!action) return;
  event.preventDefault();
  actions[action.type](action);
}

const clicks = {
  "[data-mode]": (el) => setMode(el.dataset.mode),
  "[data-pos]": (el) => navigate(goTo(state.session, Number(el.dataset.pos))),
  "[data-right]": (el) => rate(el.dataset.right === "true"),
  ".loci-flag": (el) => flag(cardOf.get(el.closest(".loci-question")).id),
  ".loci-next": actions.next,
  "#loci-prev": actions.prev,
  "#loci-next": actions.next,
  "#loci-undo": undo,
  "#loci-reveal": revealAll,
  "#loci-restart": () => changeRound(newRound(state, deck)),
  "#loci-again": () => changeRound(newRound(state, deck)),
  "#loci-repeat": () => changeRound(repeatMissed(state.session)),
  "#loci-reset": resetAll,
  "#loci-export": downloadProgress,
  "#loci-import": () => byId("loci-file").click(),
  "#loci-shortcuts": actions.help,
  "#loci-help-open": actions.help,
};

function onClick(event) {
  for (const [selector, run] of Object.entries(clicks)) {
    const el = event.target.closest(selector);
    if (el) run(el);
  }
  if (!event.target.closest(".loci-menu > summary, #loci-theme")) closeMenu();
  // Keep Space and Enter for the shortcuts instead of re-triggering the focused control.
  if (event.target.closest("button, label, summary")) requestAnimationFrame(() => document.activeElement?.blur());
}

function onChange(event) {
  const { id, dataset, files } = event.target;
  if (id === "loci-theme") setTheme(parseTheme(event.target.value));
  if (id === "loci-file") {
    restoreProgress(files[0]);
    event.target.value = "";
  }
  if (dataset?.pref) setPref(dataset.pref, event.target.value);
}

questions.forEach(decorate);
questions.filter(isChoice).forEach(shuffleOptions);
buildInterface();
setTheme(parseTheme(readStored(THEME_KEY)));
document.addEventListener("click", onClick);
document.addEventListener("keydown", onKey);
document.addEventListener("change", onChange);
document.addEventListener("input", (event) => {
  if (event.target.id !== "loci-search") return;
  query = event.target.value.trim().toLowerCase();
  paint();
});
document.addEventListener("submit", (event) => {
  if (!event.target.matches(".loci-question")) return;
  event.preventDefault();
  check(event.target);
});
document.addEventListener("toggle", paint, true);
enter();
