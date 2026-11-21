#import "@preview/elembic:1.1.1" as e
#let _number = counter("loci-question")

// `typst compile --input answers=hide` prints a sheet to test yourself on paper.
#let _answers-shown = sys.inputs.at("answers", default: "show") != "hide"

/// `typst compile --input seed=anna` draws other values for `vars`. The seed is
/// any text, so a student's name or number gives each of them their own sheet.
#let seed = sys.inputs.at("seed", default: "0")

// FNV-1a with one xorshift round to spread similar seeds apart. Everything
// stays below 2^56, because Typst integers fail on overflow.
#let _hash(text) = {
  let wrap = 4294967296
  let h = 2166136261
  for char in text.codepoints() {
    h = calc.rem(h.bit-xor(str.to-unicode(char)) * 16777619, wrap)
  }
  h = h.bit-xor(calc.rem(h.bit-lshift(13), wrap))
  h = h.bit-xor(h.bit-rshift(17))
  h.bit-xor(calc.rem(h.bit-lshift(5), wrap))
}

// Picks one candidate per variable. Each pick depends on the seed, the
// question and the variable's name, so adding a variable keeps the others.
#let _draw(number, vars) = {
  let drawn = (:)
  for (name, candidates) in vars {
    assert(
      type(candidates) == array and candidates.len() > 0,
      message: "`vars." + name + "` must be a non-empty array of candidates",
    )
    let pick = _hash(seed + "/" + str(number) + "/" + name)
    drawn.insert(name, candidates.at(calc.rem(pick, candidates.len())))
  }
  drawn
}

// `("baz")` is a plain value in Typst, not an array.
#let _as-array(value) = if type(value) == array { value } else { (value,) }

// PDF parts are elembic elements, so documents can restyle them with
// `#show e.selector(loci.question): it => ...` and `#show: e.set_(...)`.
// The defaults only use strong, emph and the document's own text style.
#let _prefix = "@local/loci"

/// The question text, strong by default.
#let prompt = e.element.declare(
  "prompt",
  prefix: _prefix,
  display: it => strong(it.body),
  fields: (e.field("body", content, required: true),),
)

/// The answer of a `q`. On worksheets it is hidden but keeps its space.
#let answer = e.element.declare(
  "answer",
  prefix: _prefix,
  display: it => block(it.body),
  fields: (e.field("body", content, required: true),),
)

/// A hint. It shows on worksheets and answer sheets alike.
#let hint = e.element.declare(
  "hint",
  prefix: _prefix,
  display: it => block[#emph[Hint:] #it.body],
  fields: (e.field("body", content, required: true),),
)

/// The explanation of a choice question. Hidden on worksheets like `answer`.
#let why = e.element.declare(
  "why",
  prefix: _prefix,
  display: it => block[#emph[Why:] #it.body],
  fields: (e.field("body", content, required: true),),
)

/// One choice option. `correct` is only true on answer sheets, so a
/// worksheet never gives the answer away. `markers` maps the `input`
/// (`"checkbox"` or `"radio"`) to an (empty, filled) pair.
#let option = e.element.declare(
  "option",
  prefix: _prefix,
  display: it => {
    let (empty, filled) = it.markers.at(it.input)
    grid(columns: (auto, 1fr), column-gutter: 0.5em, if it.correct { filled } else { empty }, it.body)
  },
  fields: (
    e.field("body", content, required: true),
    e.field("input", str, default: "checkbox"),
    e.field("correct", bool, default: false),
    e.field("markers", dictionary, default: (
      checkbox: (sym.square.stroked, sym.square.filled),
      radio: (sym.circle.stroked, sym.circle.filled),
    )),
  ),
)

/// A whole question: `3) Prompt (7×)`, then its `body` (options or answer).
/// `kind` is `"mc"`, `"sc"` or `"q"`; `n` how often it was asked.
#let question = e.element.declare(
  "question",
  prefix: _prefix,
  display: it => block(breakable: it.breakable, width: 100%, {
    strong[#it.number)]
    [ ]
    prompt(it.prompt)
    if it.n != none [ (#str(it.n)×)]
    parbreak()
    it.body
  }),
  fields: (
    e.field("body", content, required: true),
    e.field("number", int, default: 0),
    e.field("kind", str, default: "q"),
    e.field("n", e.types.option(int), default: none),
    e.field("prompt", content, default: []),
    e.field("breakable", bool, default: false),
  ),
)

// Worksheets hide revealing parts instead of dropping them, so both sheets
// share one layout and the answer key lies on top of the worksheet.
#let _reveal(body) = if _answers-shown { body } else { hide(body) }

#let _pdf-hint(body) = if body != none { hint(body) }
#let _pdf-why(body) = if body != none { _reveal(why(body)) }
#let _pdf-answer(body) = _reveal(answer(body))

// Correct options come first in the source, so options are interleaved by a
// fixed rule instead of giving the order away. Both sheets use the same order.
#let _pdf-options(number, ok, err) = {
  let options = ok.map(option => (true, option)) + err.map(option => (false, option))
  let count = options.len()
  let step = range(1, count + 1).rev().find(s => calc.gcd(s, count) == 1 and s < count)
  if step == none { return options }
  range(count).map(i => options.at(calc.rem(number + i * step, count)))
}

#let _pdf-choice(card, kind, input, prompt, ok, err, hint, why) = question(
  number: card.number,
  kind: kind,
  n: card.n,
  prompt: prompt,
  {
    context stack(
      spacing: par.leading,
      .._pdf-options(card.number, ok, err).map(((correct, body)) => option(
        body,
        input: input,
        correct: correct and _answers-shown,
      )),
    )
    _pdf-hint(hint)
    _pdf-why(why)
  },
)

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
      n: n,
      label: "[" + str(number) + "] " + upper(kind) + asked,
      attrs: if n == none { (:) } else { ("data-n": str(n)) },
    ))
  }
}

#let _choice(kind, short, input, prompt, ok, err, n, hint, why) = _numbered(kind, n, card => {
  if target() == "html" {
    _html-choice(card, input, prompt, ok, err, hint, why)
  } else {
    _pdf-choice(card, short, input, prompt, ok, err, hint, why)
  }
})

/// Multiple choice: any number of `ok` options may be correct.
/// `hint` can be opened before answering, `why` explains the answer afterwards.
#let mc(prompt, ok: (), err: (), n: none, hint: none, why: none) = {
  let ok = _as-array(ok)
  assert(ok.len() > 0, message: "mc needs at least one `ok` option")
  _choice("Multiple choice", "mc", "checkbox", prompt, ok, _as-array(err), n, hint, why)
}

/// Single choice: exactly one `ok` option is correct.
/// `hint` can be opened before answering, `why` explains the answer afterwards.
#let sc(prompt, ok: (), err: (), n: none, hint: none, why: none) = {
  let ok = _as-array(ok)
  assert(ok.len() == 1, message: "sc needs exactly one `ok` option")
  _choice("Single choice", "sc", "radio", prompt, ok, _as-array(err), n, hint, why)
}

/// Computed question: the answer is any Typst content, including code results.
/// `hint` can be opened before revealing the answer.
///
/// `vars` names arrays of candidates, for example `(a: range(2, 10))`. One
/// value per name is drawn from `seed`. `prompt`, `answer` and `hint` may then
/// be functions that take the drawn values: `v => [What is #v.a squared?]`.
#let q(prompt, answer, n: none, hint: none, vars: (:)) = _numbered("Question", n, card => {
  let drawn = _draw(card.number, vars)
  let fill(part) = if type(part) == function { part(drawn) } else { part }
  let (prompt, answer, hint) = (prompt, answer, hint).map(fill)
  if target() == "html" {
    _html-card("section", "loci-question", card, prompt, {
      _html-hint(hint)
      html.elem("details", attrs: (class: "loci-answer"), {
        html.elem("summary", "Show answer")
        html.elem("div", answer)
      })
    })
  } else {
    question(number: card.number, kind: "q", n: card.n, prompt: prompt, {
      _pdf-hint(hint)
      _pdf-answer(answer)
    })
  }
})
