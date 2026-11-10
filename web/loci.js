import {
  MASTERY_STREAK,
  cardIds,
  cardStats,
  goTo,
  grade,
  keyAction,
  move,
  overview,
  parseSaved,
  parseTheme,
  repeatMissed,
  resetProgress,
  sectionPaths,
  sections,
  startSession,
  summary,
} from "/loci-core.js";

const STORAGE_KEY = "loci";
const THEME_KEY = "loci-theme";
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

const save = () => store(STORAGE_KEY, JSON.stringify(state));

let state = parseSaved(readStored(STORAGE_KEY), deck);
const past = [];

const byId = (id) => document.getElementById(id);
const currentEntry = () => state.session.tape[state.session.pos];
const currentElement = () => elementOf.get(currentEntry()?.id);
const isCards = () => state.prefs.mode === "cards";

function isAnswered(el) {
  return el.matches("form") ? el.classList.contains("loci-checked") : el.querySelector("details").open;
}

function shuffleOptions(form) {
  // Typst emits correct options first, so the order must not survive.
  const options = form.querySelector(".loci-options");
  for (let i = options.children.length; i > 1; i--) {
    options.append(options.children[Math.floor(Math.random() * i)]);
  }
}

function resetCard(el) {
  el.querySelector(".loci-verdict").textContent = "";
  if (el.matches("form")) {
    el.classList.remove("loci-checked");
    el.reset();
    shuffleOptions(el);
  } else {
    el.querySelector("details").open = false;
  }
}

function decorate(el) {
  el.insertAdjacentHTML(
    "beforeend",
    `<div class="loci-verdict" role="status"></div>
     <div class="loci-rate" hidden>
       <button type="button" data-right="true">Knew it</button>
       <button type="button" data-right="false">Missed it</button>
     </div>
     <div class="loci-meta"></div>`,
  );
}

function buildInterface() {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<header class="loci-ui loci-bar">
       <div class="loci-heading">
         <strong id="loci-title"></strong><span id="loci-stats"></span>
         <select id="loci-theme" aria-label="Theme">
           <option value="system">System theme</option>
           <option value="light">Light</option>
           <option value="dark">Dark</option>
         </select>
       </div>
       <div class="loci-controls">
         <span class="loci-seg">
           <button type="button" data-mode="cards">Cards</button>
           <button type="button" data-mode="list">List</button>
         </span>
         <select id="loci-section" data-pref="section" aria-label="Section">
           <option value="*">All sections</option>
         </select>
         <select id="loci-filter" data-pref="filter" aria-label="Filter">
           <option value="all">All questions</option>
           <option value="due">Not mastered</option>
           <option value="missed">Last missed</option>
           <option value="new">New</option>
         </select>
         <select id="loci-order" data-pref="order" aria-label="Order">
           <option value="document">Document order</option>
           <option value="shuffle">Shuffled</option>
           <option value="weakest">Weakest first</option>
           <option value="frequency">Most asked</option>
         </select>
         <button type="button" id="loci-reveal" class="loci-list-only">Reveal all</button>
         <button type="button" id="loci-restart">Restart round</button>
         <button type="button" id="loci-reset">Reset progress</button>
       </div>
     </header>`,
  );
  document.body.insertAdjacentHTML(
    "beforeend",
    `<section class="loci-ui loci-summary loci-cards-only" id="loci-summary" hidden>
       <div class="loci-label" id="loci-summary-title"></div>
       <p id="loci-summary-text"></p>
       <button type="button" id="loci-repeat"></button>
       <button type="button" id="loci-again">Restart round</button>
     </section>
     <nav class="loci-ui loci-pager loci-cards-only" aria-label="Questions">
       <div id="loci-strip"></div>
       <div class="loci-pager-row">
         <button type="button" id="loci-first" title="First (Home)">|&lt;</button>
         <button type="button" id="loci-prev" title="Previous (←)">&lt;</button>
         <span id="loci-pos"></span>
         <button type="button" id="loci-next" title="Next (→)">&gt;</button>
         <button type="button" id="loci-last" title="Last (End)">&gt;|</button>
         <button type="button" id="loci-undo" title="Undo (U)">Undo</button>
       </div>
       <p class="loci-hint">Space: reveal, check, next · 1-9: pick or grade</p>
     </nav>`,
  );
  byId("loci-title").textContent = document.title || "loci";
  const names = sections(deck);
  byId("loci-section").append(...names.map((name) => new Option(name, name)));
  byId("loci-section").hidden = names.length === 0;
}

function paintControls() {
  const { mastered, learning, new: unseen } = overview(deck, state.history);
  byId("loci-stats").textContent = `${mastered} mastered · ${learning} learning · ${unseen} new`;
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.classList.toggle("loci-active", button.dataset.mode === state.prefs.mode);
  }
  for (const select of document.querySelectorAll("[data-pref]")) {
    select.value = state.prefs[select.dataset.pref];
  }
}

function paintCard(card, listed) {
  const el = elementOf.get(card.id);
  const entry = currentEntry();
  const onScreen = isCards() && card.id === entry?.id;
  el.hidden = isCards() ? !onScreen : !listed.has(card.id);
  el.querySelector(".loci-rate").hidden = el.matches("form") || !(onScreen && isAnswered(el) && entry.grade === null);
  const { seen, missed, streak, status } = cardStats(state.history[card.id]);
  el.querySelector(".loci-meta").textContent =
    `${status} · seen ${seen} · missed ${missed} · streak ${streak}/${MASTERY_STREAK}`;
}

function summaryText() {
  const { cards, firstTry, misses, skipped } = summary(state.session);
  if (cards === 0) return "No questions match. Change the filter or section above.";
  return `${cards} cards · ${firstTry} right first try · ${misses} wrong · ${skipped} skipped`;
}

function paintSummary() {
  const { tape, pos } = state.session;
  const missed = summary(state.session).missed.length;
  byId("loci-summary").hidden = !isCards() || pos < tape.length;
  byId("loci-summary-title").textContent = "ROUND COMPLETE";
  byId("loci-summary-text").textContent = summaryText();
  byId("loci-repeat").hidden = missed === 0;
  byId("loci-repeat").textContent = `Repeat missed (${missed})`;
}

function stripCell({ id, grade: result }, index) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.dataset.pos = index;
  cell.dataset.grade = String(result);
  cell.textContent = numberOf.get(id);
  cell.classList.toggle("loci-active", index === state.session.pos);
  return cell;
}

function paintPager() {
  const { tape, pos } = state.session;
  byId("loci-strip").replaceChildren(...tape.map(stripCell));
  byId("loci-pos").textContent = pos < tape.length ? `${pos + 1} / ${tape.length}` : `end / ${tape.length}`;
  byId("loci-undo").disabled = past.length === 0;
}

function paint() {
  document.body.classList.toggle("loci-cards", isCards());
  document.body.classList.toggle("loci-list", !isCards());
  const listed = new Set(state.session.tape.map((entry) => entry.id));
  for (const card of deck) paintCard(card, listed);
  paintControls();
  paintSummary();
  paintPager();
}

/** Shows the current position fresh, so a repeat cannot be answered by memory of the screen. */
function enter() {
  const el = currentElement();
  if (el) resetCard(el);
  save();
  paint();
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

const newRound = () => startSession(deck, state.history, state.prefs);

function rate(right) {
  commit(grade(state, right));
  navigate(move(state.session, 1));
}

function undo() {
  if (past.length === 0) return;
  state = past.pop();
  enter();
}

function check(form) {
  if (!form.querySelector("input:checked")) return;
  const right = [...form.querySelectorAll("input")].every((input) => input.checked === (input.value === "ok"));
  form.classList.add("loci-checked");
  form.querySelector(".loci-verdict").textContent = right ? "Right" : "Wrong";
  if (isCards()) commit(grade(state, right));
  save();
  paint();
}

function finish() {
  changeRound(summary(state.session).missed.length > 0 ? repeatMissed(state.session) : newRound());
}

function revealAll() {
  const shown = questions.filter((el) => !el.hidden);
  const reveal = !shown.every(isAnswered);
  for (const el of shown) {
    if (!el.matches("form")) el.querySelector("details").open = reveal;
    else el.classList.toggle("loci-checked", reveal);
  }
}

function setPref(key, value) {
  const prefs = { ...state.prefs, [key]: value };
  commit({ ...state, prefs, session: startSession(deck, state.history, prefs) });
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

function resetAll() {
  if (!confirm("Delete all progress for this document? Undo works until you reload.")) return;
  commit(resetProgress(state, deck));
  enter();
}

const actions = {
  next: () => navigate(move(state.session, 1)),
  prev: () => navigate(move(state.session, -1)),
  first: () => navigate(goTo(state.session, 0)),
  last: () => navigate(goTo(state.session, state.session.tape.length - 1)),
  undo,
  finish,
  check: () => currentElement().requestSubmit(),
  reveal: () => {
    currentElement().querySelector("details").open = true;
  },
  toggle: ({ index }) => currentElement().querySelector(".loci-options").children[index].querySelector("input").click(),
  grade: ({ right }) => rate(right),
};

function currentView() {
  const el = currentElement();
  if (!el) return { atEnd: true };
  return {
    atEnd: false,
    choice: el.matches("form"),
    answered: isAnswered(el),
    graded: currentEntry().grade !== null,
    optionCount: el.querySelectorAll("input").length,
  };
}

function onKey(event) {
  const ignored = event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.("select");
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
  "#loci-first": actions.first,
  "#loci-prev": actions.prev,
  "#loci-next": actions.next,
  "#loci-last": actions.last,
  "#loci-undo": undo,
  "#loci-reveal": revealAll,
  "#loci-restart": () => changeRound(newRound()),
  "#loci-again": () => changeRound(newRound()),
  "#loci-repeat": () => changeRound(repeatMissed(state.session)),
  "#loci-reset": resetAll,
};

function onClick(event) {
  for (const [selector, run] of Object.entries(clicks)) {
    const el = event.target.closest(selector);
    if (el) run(el);
  }
  // Keep Space and Enter for the shortcuts instead of re-triggering the focused control.
  if (event.target.closest("button, label, summary")) requestAnimationFrame(() => document.activeElement?.blur());
}

questions.forEach(decorate);
questions.filter((el) => el.matches("form")).forEach(shuffleOptions);
buildInterface();
setTheme(parseTheme(readStored(THEME_KEY)));
document.addEventListener("click", onClick);
document.addEventListener("keydown", onKey);
document.addEventListener("change", (event) => {
  if (event.target.id === "loci-theme") setTheme(parseTheme(event.target.value));
  const key = event.target.dataset?.pref;
  if (key) setPref(key, event.target.value);
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  check(event.target);
});
document.addEventListener("toggle", paint, true);
enter();
