#let _accent = rgb("#e94f0d")
#let _muted = rgb("#6e6e6e")
#let _number = counter("loci-question")

// `typst compile --input answers=hide` prints a sheet to test yourself on paper.
#let _answers-shown = sys.inputs.at("answers", default: "show") != "hide"

// `("baz")` is a plain value in Typst, not an array.
#let _as-array(value) = if type(value) == array { value } else { (value,) }

#let _pdf-card(label, prompt, body) = block(
  width: 100%,
  breakable: false,
  above: 1.8em,
  below: 1.8em,
  inset: (top: 8pt),
  stroke: (top: 0.75pt + _accent),
  {
    set text(font: "DejaVu Sans Mono", size: 9pt)
    set par(justify: false)
    text(size: 7.5pt, fill: _accent, tracking: 0.08em, label)
    v(2pt)
    text(size: 10pt, weight: "bold", prompt)
    v(4pt)
    body
  },
)

#let _pdf-note(label, body) = if body != none {
  v(4pt)
  text(size: 8pt, fill: _muted, [#label: #body])
}

// Without answers the hint helps; with them the explanation does.
#let _pdf-notes(hint, why) = if _answers-shown { _pdf-note("Why", why) } else { _pdf-note("Hint", hint) }

#let _pdf-marker(input, correct) = {
  let correct = correct and _answers-shown
  let fill = if correct { _accent } else { none }
  let stroke = 0.75pt + if correct { _accent } else { _muted }
  if input == "radio" {
    circle(radius: 0.4em, fill: fill, stroke: stroke)
  } else {
    square(size: 0.8em, fill: fill, stroke: stroke)
  }
}

// Correct options come first in the source, so a sheet without answers
// interleaves them by a fixed rule instead of giving the order away.
#let _pdf-options(number, ok, err) = {
  let options = ok.map(option => (true, option)) + err.map(option => (false, option))
  if _answers-shown { return options }
  let count = options.len()
  let step = range(1, count + 1).rev().find(s => calc.gcd(s, count) == 1 and s < count)
  if step == none { return options }
  range(count).map(i => options.at(calc.rem(number + i * step, count)))
}

#let _pdf-choice(card, input, prompt, ok, err, hint, why) = _pdf-card(card.label, prompt, {
  grid(
    columns: (auto, 1fr),
    column-gutter: 0.8em,
    row-gutter: 0.7em,
    .._pdf-options(card.number, ok, err).map(((correct, option)) => (_pdf-marker(input, correct), option)).flatten(),
  )
  _pdf-notes(hint, why)
})

#let _html-card(tag, class, card, prompt, body) = html.elem(tag, attrs: (class: class) + card.attrs, {
  html.elem("div", attrs: (class: "loci-label"), card.label)
  html.elem("div", attrs: (class: "loci-prompt"), prompt)
  body
})

#let _html-option(input, name, value, option) = html.elem("label", {
  html.elem("input", attrs: (type: input, name: name, value: value))
  html.elem("span", option)
})

#let _html-hint(hint) = if hint != none {
  html.elem("details", attrs: (class: "loci-tip"), {
    html.elem("summary", "Hint")
    html.elem("div", hint)
  })
}

#let _html-choice(card, input, prompt, ok, err, hint, why) = {
  let name = "loci-" + str(card.number)
  _html-card("form", "loci-question loci-choice", card, prompt, {
    _html-hint(hint)
    html.elem("div", attrs: (class: "loci-options"), {
      for option in ok { _html-option(input, name, "ok", option) }
      for option in err { _html-option(input, name, "err", option) }
    })
    if why != none { html.elem("div", attrs: (class: "loci-why"), why) }
    html.elem("button", attrs: (type: "submit"), "Check")
  })
}

// Runs `show-question` with the card: its number, printed label and HTML data.
// `n` says how often the question was asked, for example in past exams.
#let _numbered(kind, n, show-question) = {
  assert(
    n == none or (type(n) == int and n > 0),
    message: "`n` must be a positive integer",
  )
  _number.step()
  context {
    let number = _number.get().first()
    let asked = if n == none { "" } else { " · " + str(n) + "×" }
    show-question((
      number: number,
      label: "[" + str(number) + "] " + upper(kind) + asked,
      attrs: if n == none { (:) } else { ("data-n": str(n)) },
    ))
  }
}

#let _choice(kind, input, prompt, ok, err, n, hint, why) = _numbered(kind, n, card => {
  if target() == "html" {
    _html-choice(card, input, prompt, ok, err, hint, why)
  } else {
    _pdf-choice(card, input, prompt, ok, err, hint, why)
  }
})

/// Multiple choice: any number of `ok` options may be correct.
/// `hint` can be opened before answering, `why` explains the answer afterwards.
#let mc(prompt, ok: (), err: (), n: none, hint: none, why: none) = {
  let ok = _as-array(ok)
  assert(ok.len() > 0, message: "mc needs at least one `ok` option")
  _choice("Multiple choice", "checkbox", prompt, ok, _as-array(err), n, hint, why)
}

/// Single choice: exactly one `ok` option is correct.
/// `hint` can be opened before answering, `why` explains the answer afterwards.
#let sc(prompt, ok: (), err: (), n: none, hint: none, why: none) = {
  let ok = _as-array(ok)
  assert(ok.len() == 1, message: "sc needs exactly one `ok` option")
  _choice("Single choice", "radio", prompt, ok, _as-array(err), n, hint, why)
}

/// Computed question: the answer is any Typst content, including code results.
/// `hint` can be opened before revealing the answer.
#let q(prompt, answer, n: none, hint: none) = _numbered("Question", n, card => {
  if target() == "html" {
    _html-card("section", "loci-question", card, prompt, {
      _html-hint(hint)
      html.elem("details", attrs: (class: "loci-answer"), {
        html.elem("summary", "Show answer")
        html.elem("div", answer)
      })
    })
  } else {
    _pdf-card(card.label, prompt, if _answers-shown { answer } else { _pdf-notes(hint, none) + v(5em) })
  }
})
