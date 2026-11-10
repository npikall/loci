#let _accent = rgb("#e94f0d")
#let _muted = rgb("#6e6e6e")
#let _number = counter("loci-question")

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

#let _pdf-marker(input, correct) = {
  let fill = if correct { _accent } else { none }
  let stroke = 0.75pt + if correct { _accent } else { _muted }
  if input == "radio" {
    circle(radius: 0.4em, fill: fill, stroke: stroke)
  } else {
    square(size: 0.8em, fill: fill, stroke: stroke)
  }
}

#let _pdf-choice(label, input, prompt, ok, err) = _pdf-card(label, prompt, grid(
  columns: (auto, 1fr),
  column-gutter: 0.8em,
  row-gutter: 0.7em,
  ..ok.map(option => (_pdf-marker(input, true), option)).flatten(),
  ..err.map(option => (_pdf-marker(input, false), option)).flatten(),
))

#let _html-card(tag, class, card, prompt, body) = html.elem(tag, attrs: (class: class) + card.attrs, {
  html.elem("div", attrs: (class: "loci-label"), card.label)
  html.elem("div", attrs: (class: "loci-prompt"), prompt)
  body
})

#let _html-option(input, name, value, option) = html.elem("label", {
  html.elem("input", attrs: (type: input, name: name, value: value))
  html.elem("span", option)
})

#let _html-choice(card, input, prompt, ok, err) = {
  let name = "loci-" + str(card.number)
  _html-card("form", "loci-question loci-choice", card, prompt, {
    html.elem("div", attrs: (class: "loci-options"), {
      for option in ok { _html-option(input, name, "ok", option) }
      for option in err { _html-option(input, name, "err", option) }
    })
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

#let _choice(kind, input, prompt, ok, err, n) = _numbered(kind, n, card => {
  if target() == "html" {
    _html-choice(card, input, prompt, ok, err)
  } else {
    _pdf-choice(card.label, input, prompt, ok, err)
  }
})

/// Multiple choice: any number of `ok` options may be correct.
#let mc(prompt, ok: (), err: (), n: none) = {
  let ok = _as-array(ok)
  assert(ok.len() > 0, message: "mc needs at least one `ok` option")
  _choice("Multiple choice", "checkbox", prompt, ok, _as-array(err), n)
}

/// Single choice: exactly one `ok` option is correct.
#let sc(prompt, ok: (), err: (), n: none) = {
  let ok = _as-array(ok)
  assert(ok.len() == 1, message: "sc needs exactly one `ok` option")
  _choice("Single choice", "radio", prompt, ok, _as-array(err), n)
}

/// Computed question: the answer is any Typst content, including code results.
#let q(prompt, answer, n: none) = _numbered("Question", n, card => {
  if target() == "html" {
    _html-card("section", "loci-question", card, prompt, html.elem("details", {
      html.elem("summary", "Show answer")
      html.elem("div", answer)
    }))
  } else {
    _pdf-card(card.label, prompt, answer)
  }
})
