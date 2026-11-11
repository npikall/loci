// Study logic without the DOM. Every function is pure and returns new values.
//
// Glossary
//   card     one question in the document: { id, num, section, n }
//   deck     all cards of the document
//   history  per card id, every grade so far as a string: "o" right, "x" missed
//   tape     the cards of this round, in play order; a miss adds a later repeat
//   session  a tape and the position on it; pos === tape.length is the summary
//   mastered the last MASTERY_STREAK grades of a card were all right
//   reviewed per card id, the day number of its last grade
//   due      a card is due when its streak-based interval since that day has passed
//   flags    card ids the student marked to come back to
//   theme    color scheme of the page; stored apart from study state so Undo never changes it

export const MASTERY_STREAK = 3;
export const REPEAT_GAP = 3;
/** Days to wait after the last grade, by streak. Longer streaks keep the last interval. */
export const REVIEW_DAYS = [0, 1, 3, 7, 14, 30, 60];

const SEPARATOR = " › ";
const CHOICES = {
  mode: ["cards", "list"],
  filter: ["all", "review", "due", "missed", "new", "flagged"],
  order: ["document", "shuffle", "frequency", "weakest"],
};

export const emptyState = () => ({
  history: {},
  reviewed: {},
  flags: {},
  session: { tape: [], pos: 0 },
  prefs: { mode: "cards", filter: "all", order: "document", section: "*" },
});

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Ids follow the prompt, so inserting a question keeps the progress of others. */
export function cardIds(prompts) {
  const seen = new Map();
  return prompts.map((prompt) => {
    const h = hash(prompt);
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return `${h}-${count}`;
  });
}

/** Takes headings ({level, text}) and questions in document order. */
export function sectionPaths(nodes) {
  let open = [];
  const paths = [];
  for (const node of nodes) {
    if (node.question) paths.push(open.map((h) => h.text).join(SEPARATOR));
    else open = [...open.filter((h) => h.level < node.level), node];
  }
  return paths;
}

export function sections(deck) {
  const found = new Set();
  for (const { section } of deck) {
    const parts = section ? section.split(SEPARATOR) : [];
    parts.forEach((_, i) => found.add(parts.slice(0, i + 1).join(SEPARATOR)));
  }
  return [...found];
}

export function matchesSection(section, wanted) {
  return wanted === "*" || section === wanted || section.startsWith(wanted + SEPARATOR);
}

export function cardStats(log = "") {
  const seen = log.length;
  const streak = seen - (log.lastIndexOf("x") + 1);
  const status = seen === 0 ? "new" : streak >= MASTERY_STREAK ? "mastered" : "learning";
  return { seen, missed: log.split("x").length - 1, streak, status };
}

/** Local calendar day as a whole number, so "tomorrow" starts at midnight. */
export function dayOf(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** The day a card should come back. Cards without a recorded day are due at once. */
export function dueDay(log = "", reviewedOn) {
  if (!Number.isInteger(reviewedOn)) return -Infinity;
  const { streak } = cardStats(log);
  return reviewedOn + REVIEW_DAYS[Math.min(streak, REVIEW_DAYS.length - 1)];
}

export const isDue = (log, reviewedOn, today) => dueDay(log, reviewedOn) <= today;

export function overview(deck, history, reviewed = {}, today = dayOf()) {
  const counts = { mastered: 0, learning: 0, new: 0, due: 0 };
  for (const { id } of deck) {
    counts[cardStats(history[id]).status]++;
    if (isDue(history[id], reviewed[id], today)) counts.due++;
  }
  return counts;
}

const FILTERS = {
  all: () => true,
  review: ({ log, reviewedOn, today }) => isDue(log, reviewedOn, today),
  due: ({ log }) => cardStats(log).status !== "mastered",
  missed: ({ log }) => log?.endsWith("x") ?? false,
  new: ({ log }) => cardStats(log).status === "new",
  flagged: ({ flagged }) => flagged,
};

function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weakness(a, b) {
  return a.streak - b.streak || b.missed - a.missed;
}

function ordered(cards, history, order, random) {
  const byNum = [...cards].sort((a, b) => a.num - b.num);
  switch (order) {
    case "shuffle":
      return shuffled(byNum, random);
    case "frequency":
      return byNum.sort((a, b) => b.n - a.n || a.num - b.num);
    case "weakest":
      return byNum.sort((a, b) => weakness(cardStats(history[a.id]), cardStats(history[b.id])) || a.num - b.num);
    default:
      return byNum;
  }
}

const tapeOf = (ids) => ({ pos: 0, tape: ids.map((id) => ({ id, grade: null })) });

/** `progress` carries what the review and flagged filters need: { reviewed, flags, today }. */
export function startSession(deck, history, prefs, random = Math.random, progress = {}) {
  const { reviewed = {}, flags = {}, today = dayOf() } = progress;
  const wanted = (card) =>
    FILTERS[prefs.filter]({
      log: history[card.id],
      reviewedOn: reviewed[card.id],
      flagged: flags[card.id] === true,
      today,
    });
  const chosen = deck.filter((card) => matchesSection(card.section, prefs.section) && wanted(card));
  return tapeOf(ordered(chosen, history, prefs.order, random).map((card) => card.id));
}

/** Starts a round from everything a state knows. */
export function newRound(state, deck, random = Math.random, today = dayOf()) {
  const { reviewed, flags } = state;
  return startSession(deck, state.history, state.prefs, random, { reviewed, flags, today });
}

function withRepeat(tape, pos) {
  const { id } = tape[pos];
  const pending = tape.slice(pos + 1).some((entry) => entry.id === id && entry.grade === null);
  if (pending) return tape;
  const at = Math.min(pos + 1 + REPEAT_GAP, tape.length);
  return [...tape.slice(0, at), { id, grade: null }, ...tape.slice(at)];
}

/** Records the grade at the current position. A position is graded only once. */
export function grade(state, right, today = dayOf()) {
  const { tape, pos } = state.session;
  const entry = tape[pos];
  if (!entry || entry.grade !== null) return state;
  const graded = tape.with(pos, { ...entry, grade: right });
  return {
    ...state,
    history: { ...state.history, [entry.id]: (state.history[entry.id] ?? "") + (right ? "o" : "x") },
    reviewed: { ...state.reviewed, [entry.id]: today },
    session: { pos, tape: right ? graded : withRepeat(graded, pos) },
  };
}

export const goTo = (session, pos) => ({ ...session, pos: Math.min(session.tape.length, Math.max(0, pos)) });
export const move = (session, delta) => goTo(session, session.pos + delta);

function firstGrades(tape) {
  const first = new Map();
  for (const { id, grade: g } of tape) {
    if (!first.has(id) || first.get(id) === null) first.set(id, g);
  }
  return first;
}

const missedIds = (tape) => [...new Set(tape.filter((entry) => entry.grade === false).map((entry) => entry.id))];

export function summary({ tape }) {
  const first = [...firstGrades(tape).values()];
  return {
    cards: first.length,
    firstTry: first.filter((g) => g === true).length,
    missed: missedIds(tape),
    misses: tape.filter((entry) => entry.grade === false).length,
    skipped: tape.filter((entry) => entry.grade === null).length,
  };
}

export const repeatMissed = ({ tape }) => tapeOf(missedIds(tape));

export function resetProgress(state, deck) {
  const cleared = { ...state, history: {}, reviewed: {}, flags: {} };
  return { ...cleared, session: newRound(cleared, deck) };
}

export function toggleFlag(state, id) {
  const { [id]: was, ...rest } = state.flags;
  return { ...state, flags: was ? rest : { ...rest, [id]: true } };
}

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseHistory(raw) {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, log]) => typeof log === "string" && /^[ox]+$/.test(log)));
}

function parseReviewed(raw) {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, day]) => Number.isInteger(day)));
}

function parseFlags(raw) {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, flagged]) => flagged === true));
}

function parsePrefs(raw, deck) {
  const prefs = emptyState().prefs;
  if (!isRecord(raw)) return prefs;
  for (const [key, allowed] of Object.entries(CHOICES)) {
    if (allowed.includes(raw[key])) prefs[key] = raw[key];
  }
  if (sections(deck).includes(raw.section)) prefs.section = raw.section;
  return prefs;
}

function parseTape(raw, deck) {
  if (!Array.isArray(raw)) return [];
  const known = new Set(deck.map((card) => card.id));
  return raw
    .filter((entry) => isRecord(entry) && known.has(entry.id) && [true, false, null].includes(entry.grade))
    .map(({ id, grade: g }) => ({ id, grade: g }));
}

/** The one place stored data enters: keeps what is valid and rebuilds the rest. */
export function parseSaved(text, deck, random = Math.random) {
  const raw = parseJson(text) ?? {};
  const kept = {
    history: parseHistory(raw.history),
    reviewed: parseReviewed(raw.reviewed),
    flags: parseFlags(raw.flags),
    prefs: parsePrefs(raw.prefs, deck),
  };
  const tape = parseTape(raw.session?.tape, deck);
  if (tape.length === 0) return { ...kept, session: newRound(kept, deck, random) };
  const pos = Number.isInteger(raw.session.pos) ? raw.session.pos : 0;
  return { ...kept, session: goTo({ tape: [...tape, ...addedCards(raw, tape, kept, deck, random)], pos: 0 }, pos) };
}

// Questions written while a round is in play join its end. `known` lists the
// deck at the last save, so cards a round left out on purpose stay out.
function addedCards(raw, tape, kept, deck, random) {
  const known = new Set([...(Array.isArray(raw.known) ? raw.known : []), ...tape.map((entry) => entry.id)]);
  return newRound(kept, deck, random).tape.filter((entry) => !known.has(entry.id));
}

const BACKUP_FORMAT = "loci-progress-1";

/** A backup holds what was learned, not the round in play or the preferences. */
export function exportProgress({ history, reviewed, flags }) {
  return JSON.stringify({ format: BACKUP_FORMAT, history, reviewed, flags }, null, 2);
}

/** Replaces progress with a backup and starts a new round; null when the text is not a backup. */
export function importProgress(state, text, deck, random = Math.random) {
  const raw = parseJson(text);
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) return null;
  const restored = {
    ...state,
    history: parseHistory(raw.history),
    reviewed: parseReviewed(raw.reviewed),
    flags: parseFlags(raw.flags),
  };
  return { ...restored, session: newRound(restored, deck, random) };
}

/** Share of a round that is graded, counting each tape position once. */
export function roundProgress({ tape }) {
  const done = tape.filter((entry) => entry.grade !== null).length;
  return { done, total: tape.length, right: tape.filter((entry) => entry.grade === true).length };
}

export const parseTheme = (raw) => (["light", "dark"].includes(raw) ? raw : "system");

const NAVIGATION = {
  ArrowRight: "next",
  l: "next",
  ArrowLeft: "prev",
  h: "prev",
  Home: "first",
  End: "last",
  u: "undo",
  f: "flag",
  i: "hint",
  "?": "help",
};

function primaryAction(view) {
  if (view.atEnd) return "finish";
  if (view.choice) return view.answered ? "next" : "check";
  if (!view.answered) return "reveal";
  return view.graded ? "next" : null;
}

function digitAction(digit, view) {
  if (view.choice) {
    const usable = !view.answered && digit >= 1 && digit <= view.optionCount;
    return usable ? { type: "toggle", index: digit - 1 } : null;
  }
  const gradable = view.answered && !view.graded && (digit === 1 || digit === 2);
  return gradable ? { type: "grade", right: digit === 1 } : null;
}

/** Decides what a key press means for the card on screen; null means nothing. */
export function keyAction(key, view) {
  if (NAVIGATION[key]) return { type: NAVIGATION[key] };
  if (key === " " || key === "Enter") {
    const type = primaryAction(view);
    return type && { type };
  }
  if (/^[0-9]$/.test(key)) return digitAction(Number(key), view);
  return null;
}
