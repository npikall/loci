// Run with `loci examples/example.typ`, or compile a printable copy with
// `typst compile examples/example.typ`. Add `--input answers=hide` to print
// it without the answers.
#import "@local/loci:0.1.0": mc, q, sc

#set document(title: "Loci feature tour")

// Text outside questions shows in List mode and in the PDF, not on cards.
This file shows every feature. Headings become sections in the section menu, and
choosing a parent section includes its subsections.

= Question types

== Choice

// `mc`: any number of correct options. Options are reshuffled on every repeat.
#mc(
  "Which of these are prime numbers?",
  ok: ("2", "3", "13"),
  err: ("1", "9", "15"),
)

// `sc`: exactly one correct option. Choice questions grade themselves.
#sc(
  "Which planet is closest to the Sun?",
  ok: "Mercury",
  err: ("Venus", "Earth", "Mars"),
)

== Free recall

// `q`: reveal the answer, then grade yourself with "Knew it" or "Missed it".
#q("What does the method of loci use to organise memories?")[
  Familiar places. You walk through them in your mind and pick up what you placed there.
]

= Rich content

// Prompts, options and answers accept any Typst content.
#sc(
  [Which expression equals $sum_(k=1)^3 k$?],
  ok: [$3 dot 2$],
  err: ([$3^2$], [$2^3$]),
)

#q([State the quadratic formula for $a x^2 + b x + c = 0$.])[
  $ x = (-b plus.minus sqrt(b^2 - 4 a c)) / (2 a) $
]

#q("Which unit belongs to which quantity?")[
  #table(
    columns: 2,
    [*Quantity*], [*Unit*],
    [Force], [Newton],
    [Pressure], [Pascal],
    [Energy], [Joule],
  )
]

= Generated questions

// Questions are plain function calls, so code can produce whole drills.
#for base in range(2, 5) {
  q("What is " + str(base) + " cubed?")[#calc.pow(base, 3)]
}

= Random values

// `vars` names arrays of candidates. One value per name is drawn, and the
// prompt and the answer are functions of the drawn values. Compile with
// `--input seed=anna` to draw other values.
#q(
  vars: (a: range(2, 10), b: range(11, 20)),
  v => [What is $#v.a dot #v.b$?],
  v => [$#(v.a * v.b)$],
)

#q(
  vars: (speed: (30, 50, 80), hours: (0.5, 1.5, 2.5)),
  v => [A car drives #v.speed km/h for #v.hours hours. How far does it get?],
  v => [#(v.speed * v.hours) km],
  hint: v => [Multiply #v.speed by #v.hours.],
)

= Exam frequency

// `n` says how often a question was asked. Pick the order "Most asked" to
// study these first. It also prints as a badge next to the label.
#q("Name the three states of matter taught in school.", n: 7)[
  Solid, liquid and gas.
]

#sc("What is the chemical symbol of sodium?", ok: "Na", err: ("So", "S"), n: 3)

#mc(
  "Which of these are noble gases?",
  ok: ("Helium", "Neon"),
  err: ("Oxygen", "Nitrogen"),
  n: 1,
)

= Hints and explanations

// `hint` can be opened before answering (key I). `why` appears once a choice
// question is checked.
#sc(
  "Which organelle produces most of a cell's ATP?",
  ok: "Mitochondrion",
  err: ("Ribosome", "Golgi apparatus", "Lysosome"),
  hint: [It has its own DNA and a folded inner membrane.],
  why: [Oxidative phosphorylation runs on the inner mitochondrial membrane.],
)

#q([What is the derivative of $sin x$?], hint: [It is another trigonometric function.])[
  $cos x$
]
