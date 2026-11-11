import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MASTERY_STREAK,
  REPEAT_GAP,
  REVIEW_DAYS,
  cardIds,
  cardStats,
  dayOf,
  dueDay,
  emptyState,
  exportProgress,
  goTo,
  grade,
  importProgress,
  isDue,
  keyAction,
  matchesSection,
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
  startSession,
  summary,
  toggleFlag,
} from "./loci-core.js";

const prefs = (over = {}) => ({ ...emptyState().prefs, ...over });
const card = (id, num, over = {}) => ({ id, num, section: "", n: 0, ...over });
const deck = ["a", "b", "c", "d", "e", "f"].map((id, i) => card(id, i + 1));
const ids = (session) => session.tape.map((entry) => entry.id);
const fresh = (cards = deck, history = {}) => ({
  ...emptyState(),
  history,
  session: startSession(cards, history, prefs()),
});

test("card ids follow the prompt, not the position", () => {
  const [first] = cardIds(["What?"]);
  const [, moved] = cardIds(["New question", "What?"]);
  assert.equal(moved, first);
});

test("identical prompts get different ids", () => {
  const [one, two] = cardIds(["Same", "Same"]);
  assert.notEqual(one, two);
});

test("different prompts get different ids", () => {
  const [one, two] = cardIds(["ab", "ba"]);
  assert.notEqual(one, two);
});

test("section paths nest by heading level", () => {
  const paths = sectionPaths([
    { question: true },
    { level: 2, text: "A" },
    { question: true },
    { level: 3, text: "B" },
    { question: true },
    { level: 3, text: "C" },
    { question: true },
    { level: 2, text: "D" },
    { question: true },
  ]);
  assert.deepEqual(paths, ["", "A", "A › B", "A › C", "D"]);
});

test("sections lists parents and children once, in document order", () => {
  const cards = [
    card("a", 1, { section: "A › B" }),
    card("b", 2, { section: "A › B" }),
    card("c", 3, { section: "C" }),
    card("d", 4, { section: "" }),
  ];
  assert.deepEqual(sections(cards), ["A", "A › B", "C"]);
});

test("a section matches itself and its children only", () => {
  assert.equal(matchesSection("A › B", "A"), true);
  assert.equal(matchesSection("A", "A"), true);
  assert.equal(matchesSection("AB", "A"), false);
  assert.equal(matchesSection("anything", "*"), true);
});

test("card stats count history and the current streak", () => {
  assert.deepEqual(cardStats(undefined), { seen: 0, missed: 0, streak: 0, status: "new" });
  assert.deepEqual(cardStats("xoo"), { seen: 3, missed: 1, streak: 2, status: "learning" });
  assert.equal(cardStats("o".repeat(MASTERY_STREAK)).status, "mastered");
  assert.equal(cardStats("o".repeat(MASTERY_STREAK) + "x").status, "learning");
});

test("a session keeps document order by default", () => {
  const shuffled = [deck[2], deck[0], deck[1]];
  const session = startSession(shuffled, {}, prefs());
  assert.deepEqual(ids(session), ["a", "b", "c"]);
  assert.equal(session.pos, 0);
});

test("filters pick cards from their history", () => {
  const history = { a: "ooo", b: "x", c: "xo" };
  const pick = (filter) => ids(startSession(deck.slice(0, 4), history, prefs({ filter })));
  assert.deepEqual(pick("all"), ["a", "b", "c", "d"]);
  assert.deepEqual(pick("due"), ["b", "c", "d"]);
  assert.deepEqual(pick("missed"), ["b"]);
  assert.deepEqual(pick("new"), ["d"]);
});

test("the section filter narrows the session", () => {
  const cards = [card("a", 1, { section: "X › Y" }), card("b", 2, { section: "Z" })];
  assert.deepEqual(ids(startSession(cards, {}, prefs({ section: "X" }))), ["a"]);
});

test("frequency order puts the most asked first, ties in document order", () => {
  const cards = [card("a", 1, { n: 1 }), card("b", 2), card("c", 3, { n: 5 }), card("d", 4, { n: 1 })];
  assert.deepEqual(ids(startSession(cards, {}, prefs({ order: "frequency" }))), ["c", "a", "d", "b"]);
});

test("weakest order puts low streaks first, then most missed", () => {
  const history = { a: "ooo", b: "xxo", c: "xo", d: "x" };
  const session = startSession(deck.slice(0, 4), history, prefs({ order: "weakest" }));
  assert.deepEqual(ids(session), ["d", "b", "c", "a"]);
});

test("shuffle uses every card once and follows the random source", () => {
  const session = startSession(deck, {}, prefs({ order: "shuffle" }), () => 0);
  assert.deepEqual(ids(session), ["b", "c", "d", "e", "f", "a"]);
});

test("a right answer is recorded and adds no repeat", () => {
  const state = grade(fresh(), true);
  assert.equal(state.history.a, "o");
  assert.equal(state.session.tape[0].grade, true);
  assert.equal(state.session.tape.length, deck.length);
});

test("a missed card comes back after the repeat gap", () => {
  const state = grade(fresh(), false);
  assert.equal(state.history.a, "x");
  assert.equal(state.session.tape.length, deck.length + 1);
  const repeat = state.session.tape[1 + REPEAT_GAP];
  assert.deepEqual(repeat, { id: "a", grade: null });
});

test("a repeat lands at the end when few cards remain", () => {
  const state = grade(fresh(deck.slice(0, 2)), false);
  assert.deepEqual(ids(state.session), ["a", "b", "a"]);
});

test("a missed card repeats until it is right", () => {
  let state = fresh(deck.slice(0, 1));
  for (let misses = 1; misses <= 3; misses++) {
    state = grade(state, false);
    state = { ...state, session: move(state.session, 1) };
    assert.equal(state.session.tape.length, misses + 1);
  }
  state = grade(state, true);
  assert.equal(state.session.tape.length, 4);
  assert.equal(state.history.a, "xxxo");
});

test("grading twice at one position changes nothing", () => {
  const once = grade(fresh(), false);
  assert.equal(grade(once, true), once);
});

test("grading past the end changes nothing", () => {
  const start = fresh(deck.slice(0, 1));
  const end = { ...start, session: move(start.session, 1) };
  assert.equal(grade(end, true), end);
});

test("a second miss does not queue a second pending repeat", () => {
  let state = grade(fresh(), false); // a at 0, repeat pending at 4
  state = { ...state, session: goTo(state.session, 4) };
  state = grade(state, false); // repeat missed, new repeat pending
  state = { ...state, session: goTo(state.session, 0) };
  const pending = state.session.tape.filter((entry) => entry.id === "a" && entry.grade === null);
  assert.equal(pending.length, 1);
});

test("a miss with a repeat already pending queues nothing", () => {
  const session = {
    pos: 0,
    tape: [{ id: "a", grade: null }, { id: "b", grade: null }, { id: "a", grade: null }],
  };
  const state = grade({ ...emptyState(), session }, false);
  assert.equal(state.session.tape.length, 3);
});

test("navigation stays within the tape and its end", () => {
  const session = startSession(deck.slice(0, 2), {}, prefs());
  assert.equal(move(session, -1).pos, 0);
  assert.equal(move(session, 1).pos, 1);
  assert.equal(move(session, 9).pos, 2);
  assert.equal(goTo(session, 1).pos, 1);
  assert.equal(goTo(session, -4).pos, 0);
  assert.equal(goTo(session, 40).pos, 2);
});

test("navigation keeps grades and tape", () => {
  const { session } = grade(fresh(), false);
  assert.deepEqual(move(session, 2).tape, session.tape);
});

test("summary counts first-try results, misses and skips", () => {
  let state = fresh(deck.slice(0, 3));
  state = grade(state, true); // a right
  state = { ...state, session: move(state.session, 1) };
  state = grade(state, false); // b missed, repeat appended
  state = { ...state, session: move(state.session, 1) };
  // c skipped
  state = { ...state, session: move(state.session, 1) };
  state = grade(state, true); // b repeat right
  assert.deepEqual(summary(state.session), { cards: 3, firstTry: 1, missed: ["b"], misses: 1, skipped: 1 });
});

test("repeat missed builds a round of exactly the missed cards, once each", () => {
  let state = grade(fresh(), false);
  state = { ...state, session: goTo(state.session, 4) };
  state = grade(state, false);
  state = { ...state, session: goTo(state.session, 1) };
  state = grade(state, true);
  const round = repeatMissed(state.session);
  assert.deepEqual(round, { pos: 0, tape: [{ id: "a", grade: null }] });
});

test("overview counts cards by status", () => {
  const history = { a: "ooo", b: "x" };
  const reviewed = { a: 10, b: 10 };
  assert.deepEqual(overview(deck.slice(0, 3), history, reviewed, 10), { mastered: 1, learning: 1, new: 1, due: 2 });
});

test("reset progress clears history and restarts, keeping preferences", () => {
  const graded = grade(fresh(), false);
  const state = resetProgress({ ...graded, prefs: prefs({ mode: "list" }) }, deck);
  assert.deepEqual(state.history, {});
  assert.equal(state.prefs.mode, "list");
  assert.equal(state.session.tape.length, deck.length);
  assert.equal(state.session.tape.every((entry) => entry.grade === null), true);
});

test("saved state round-trips", () => {
  const state = grade(fresh(), false);
  assert.deepEqual(parseSaved(JSON.stringify(state), deck), state);
});

test("unreadable saved state starts fresh", () => {
  for (const raw of [null, "", "{", "3", "null", "[]"]) {
    const state = parseSaved(raw, deck);
    assert.deepEqual(state.history, {});
    assert.deepEqual(ids(state.session), deck.map((c) => c.id));
  }
});

test("invalid parts of saved state are dropped", () => {
  const state = parseSaved(
    JSON.stringify({
      history: { a: "ooo", b: "nope", c: 3 },
      prefs: { mode: "bogus", filter: "due", order: 4, section: "gone" },
      session: "broken",
    }),
    deck,
  );
  assert.deepEqual(state.history, { a: "ooo" });
  assert.deepEqual(state.prefs, prefs({ filter: "due" }));
  assert.deepEqual(ids(state.session), ["b", "c", "d", "e", "f"]);
});

test("history of questions missing from the document is kept", () => {
  const state = parseSaved(JSON.stringify({ history: { removed: "o" } }), deck);
  assert.equal(state.history.removed, "o");
});

test("a saved session forgets removed questions and clamps its position", () => {
  const session = {
    pos: 9,
    tape: [{ id: "a", grade: true }, { id: "removed", grade: null }, { id: "b", grade: null }, 7, { id: "c", grade: "x" }],
  };
  const known = deck.map((c) => c.id);
  const state = parseSaved(JSON.stringify({ session, known }), deck);
  assert.deepEqual(state.session, { pos: 2, tape: [{ id: "a", grade: true }, { id: "b", grade: null }] });
});

test("questions written during a round join its end", () => {
  const session = { pos: 2, tape: [{ id: "a", grade: true }, { id: "b", grade: true }] };
  const state = parseSaved(JSON.stringify({ session, known: ["a", "b", "c", "d"] }), deck);
  assert.deepEqual(ids(state.session), ["a", "b", "e", "f"]);
  assert.equal(state.session.pos, 2);
});

test("questions written during a round respect its filter", () => {
  const saved = {
    history: { e: "ooo" },
    prefs: { filter: "due" },
    session: { pos: 0, tape: [{ id: "a", grade: null }] },
    known: ["a", "b", "c", "d"],
  };
  assert.deepEqual(ids(parseSaved(JSON.stringify(saved), deck).session), ["a", "f"]);
});

test("progress saved before the deck was recorded gains the missing questions", () => {
  const session = { pos: 0, tape: [{ id: "a", grade: null }] };
  assert.deepEqual(ids(parseSaved(JSON.stringify({ session }), deck).session), deck.map((c) => c.id));
});

test("a saved position that is not a whole number restarts at the beginning", () => {
  const session = { pos: "x", tape: [{ id: "a", grade: null }] };
  assert.equal(parseSaved(JSON.stringify({ session }), deck).session.pos, 0);
});

test("a saved session emptied by edits starts a new one", () => {
  const session = { pos: 0, tape: [{ id: "removed", grade: null }] };
  assert.deepEqual(ids(parseSaved(JSON.stringify({ session }), deck).session), deck.map((c) => c.id));
});

const question = (over = {}) => ({ atEnd: false, choice: false, answered: false, graded: false, optionCount: 0, ...over });
const choice = (over = {}) => question({ choice: true, optionCount: 3, ...over });

test("arrows, vim keys and home/end navigate from any view", () => {
  for (const view of [question(), choice(), { atEnd: true }]) {
    assert.deepEqual(keyAction("ArrowRight", view), { type: "next" });
    assert.deepEqual(keyAction("l", view), { type: "next" });
    assert.deepEqual(keyAction("ArrowLeft", view), { type: "prev" });
    assert.deepEqual(keyAction("h", view), { type: "prev" });
    assert.deepEqual(keyAction("Home", view), { type: "first" });
    assert.deepEqual(keyAction("End", view), { type: "last" });
    assert.deepEqual(keyAction("u", view), { type: "undo" });
  }
});

test("space and enter do the next sensible step", () => {
  for (const key of [" ", "Enter"]) {
    assert.deepEqual(keyAction(key, { atEnd: true }), { type: "finish" });
    assert.deepEqual(keyAction(key, question()), { type: "reveal" });
    assert.equal(keyAction(key, question({ answered: true })), null);
    assert.deepEqual(keyAction(key, question({ answered: true, graded: true })), { type: "next" });
    assert.deepEqual(keyAction(key, choice()), { type: "check" });
    assert.deepEqual(keyAction(key, choice({ answered: true })), { type: "next" });
  }
});

test("digits toggle options until a choice is checked", () => {
  assert.deepEqual(keyAction("1", choice()), { type: "toggle", index: 0 });
  assert.deepEqual(keyAction("3", choice()), { type: "toggle", index: 2 });
  assert.equal(keyAction("4", choice()), null);
  assert.equal(keyAction("0", choice()), null);
  assert.equal(keyAction("1", choice({ answered: true })), null);
});

test("digits grade a revealed question once", () => {
  const revealed = question({ answered: true });
  assert.deepEqual(keyAction("1", revealed), { type: "grade", right: true });
  assert.deepEqual(keyAction("2", revealed), { type: "grade", right: false });
  assert.equal(keyAction("3", revealed), null);
  assert.equal(keyAction("1", question()), null);
  assert.equal(keyAction("1", question({ answered: true, graded: true })), null);
});

test("other keys and digits on the summary do nothing", () => {
  assert.equal(keyAction("x", question()), null);
  assert.equal(keyAction("1", { atEnd: true }), null);
});

test("summary does not count a first-try miss as right", () => {
  const state = grade(fresh(deck.slice(0, 1)), false);
  assert.equal(summary(state.session).firstTry, 0);
});

test("shuffle can leave every card in place", () => {
  const session = startSession(deck, {}, prefs({ order: "shuffle" }), () => 0.999);
  assert.deepEqual(ids(session), deck.map((c) => c.id));
});

test("an ungraded copy earlier on the tape does not count as a pending repeat", () => {
  const session = { pos: 1, tape: [{ id: "a", grade: null }, { id: "a", grade: null }] };
  assert.equal(grade({ ...emptyState(), session }, false).session.tape.length, 3);
});

test("a stored theme is kept when valid", () => {
  for (const theme of ["system", "light", "dark"]) assert.equal(parseTheme(theme), theme);
});

test("a missing or unknown theme follows the system", () => {
  for (const raw of [null, "", "sepia", "__proto__"]) assert.equal(parseTheme(raw), "system");
});

test("a day number changes at local midnight", () => {
  assert.equal(dayOf(new Date(2026, 0, 2, 0, 0)) - dayOf(new Date(2026, 0, 1, 23, 59)), 1);
  assert.equal(dayOf(new Date(2026, 0, 1, 0, 0)), dayOf(new Date(2026, 0, 1, 23, 59)));
});

test("a card comes back after the interval of its streak", () => {
  assert.equal(dueDay("x", 100), 100);
  assert.equal(dueDay("o", 100), 100 + REVIEW_DAYS[1]);
  assert.equal(dueDay("xoo", 100), 100 + REVIEW_DAYS[2]);
  assert.equal(dueDay("o".repeat(40), 100), 100 + REVIEW_DAYS.at(-1));
});

test("new cards and cards without a recorded day are due at once", () => {
  assert.equal(isDue(undefined, undefined, 0), true);
  assert.equal(isDue("ooo", undefined, 0), true);
  assert.equal(isDue("o", 100, 100), false);
  assert.equal(isDue("o", 100, 101), true);
});

test("grading records the day of the review", () => {
  assert.deepEqual(grade(fresh(), true, 42).reviewed, { a: 42 });
});

test("the review filter picks only due cards", () => {
  const state = { ...fresh(), history: { a: "o", b: "x", c: "ooo" }, reviewed: { a: 10, b: 10, c: 2 }, prefs: prefs({ filter: "review" }) };
  assert.deepEqual(ids(newRound(state, deck.slice(0, 4), Math.random, 10)), ["b", "c", "d"]);
  assert.deepEqual(ids(newRound(state, deck.slice(0, 4), Math.random, 11)), ["a", "b", "c", "d"]);
});

test("flags toggle and feed the flagged filter", () => {
  const flagged = toggleFlag(toggleFlag(fresh(), "b"), "e");
  assert.deepEqual(flagged.flags, { b: true, e: true });
  assert.deepEqual(ids(newRound({ ...flagged, prefs: prefs({ filter: "flagged" }) }, deck)), ["b", "e"]);
  assert.deepEqual(toggleFlag(flagged, "b").flags, { e: true });
});

test("reset progress also clears review days and flags", () => {
  const state = resetProgress(toggleFlag(grade(fresh(), true, 5), "a"), deck);
  assert.deepEqual([state.reviewed, state.flags], [{}, {}]);
});

test("a backup restores progress on another deck state and starts a new round", () => {
  const studied = toggleFlag(grade(fresh(), true, 7), "c");
  const restored = importProgress(fresh(), exportProgress(studied), deck);
  assert.deepEqual(restored.history, { a: "o" });
  assert.deepEqual(restored.reviewed, { a: 7 });
  assert.deepEqual(restored.flags, { c: true });
  assert.equal(restored.session.tape.every((entry) => entry.grade === null), true);
});

test("text that is not a backup is refused", () => {
  for (const text of ["", "{", "[]", "{}", JSON.stringify({ format: "other", history: { a: "o" } })]) {
    assert.equal(importProgress(fresh(), text, deck), null);
  }
});

test("invalid review days and flags in saved state are dropped", () => {
  const state = parseSaved(JSON.stringify({ reviewed: { a: 3, b: "x", c: 1.5 }, flags: { a: true, b: 1 } }), deck);
  assert.deepEqual(state.reviewed, { a: 3 });
  assert.deepEqual(state.flags, { a: true });
});

test("round progress counts graded positions", () => {
  const state = grade({ ...grade(fresh(), true), session: move(grade(fresh(), true).session, 1) }, false);
  assert.deepEqual(roundProgress(state.session), { done: 2, total: deck.length + 1, right: 1 });
});

test("flag, hint and help keys work from any card", () => {
  assert.deepEqual(keyAction("f", question()), { type: "flag" });
  assert.deepEqual(keyAction("i", choice()), { type: "hint" });
  assert.deepEqual(keyAction("?", question()), { type: "help" });
});
