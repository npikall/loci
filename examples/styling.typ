// Questions only use strong, emph and your document's own text style. Restyle
// them with show and set rules on loci's elements: `question`, `prompt`,
// `option`, `answer`, `hint` and `why`. loci re-exports elembic as `e`, so
// you don't need to import it in a matching version yourself.
//
// Compile with `typst compile examples/styling.typ`. Styling only applies to
// the PDF; the loci server keeps its own look.
#import "@local/loci:0.1.0": answer, e, hint, mc, option, q, question, sc, why
#import "@preview/gentle-clues:1.3.1": clue, tip

#set document(title: "Styling loci questions")

= Default look

Without any rules, questions blend into the surrounding document.

#sc("Which planet is closest to the Sun?", ok: "Mercury", err: ("Venus", "Mars"))

= Callout boxes

// Placing `it` inside a show rule draws loci's default rendering, so wrapping
// it in another package's box takes a single line.
#show e.selector(question): it => clue(title: "Question", accent-color: purple, it)

#q("What does the method of loci use to organise memories?")[
  Familiar places along an imagined route.
]

// Each part is its own element, so hints can get their own box too. Read an
// element's fields with `e.fields(it)`.
#show e.selector(hint): it => tip(e.fields(it).body)

#q([What is the derivative of $sin x$?], hint: [It is another trigonometric function.])[
  $cos x$
]

= Answers and explanations

#show e.selector(answer): it => text(fill: eastern, it)
#show e.selector(why): it => text(style: "italic", e.fields(it).body)

#mc(
  "Which of these are noble gases?",
  ok: ("Helium", "Neon"),
  err: ("Oxygen", "Nitrogen"),
  why: [They sit in group 18 of the periodic table.],
)

= Markers and page breaks

// Set rules change fields. `markers` maps each input to (empty, filled).
#show: e.set_(option, markers: (
  checkbox: ([( )], [(x)]),
  radio: (sym.circle.stroked, sym.checkmark),
))

// Questions don't break across pages by default. Long ones may.
#show: e.set_(question, breakable: true)

#sc("Which is a noble gas?", ok: "Neon", err: ("Iron", "Sodium"), n: 3)

#mc("Which are fruits?", ok: ("apple", "pear"), err: "carrot")
