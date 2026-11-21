<p align="center">
  <img src="docs/logo/loci.svg" alt="loci logo" width="260">
</p>

# loci

loci is a small tool for studying with flashcards. You write your questions into
a normal [Typst](https://typst.app) document, and `loci` turns that document
into an interactive deck that runs in your browser. The same file still compiles
to a PDF, so the deck you study from and the sheet you print are never out of
sync.

It comes in two parts: a Typst package that gives you the question functions,
and a tiny Go server that compiles the file to HTML, serves it locally and
reloads the page whenever you save.

```typ
#import "@local/loci:0.1.0": mc, q, sc

= Chemistry

#sc("What is the chemical symbol of sodium?", ok: "Na", err: ("So", "S"))
#mc("Which are noble gases?", ok: ("Helium", "Neon"), err: "Oxygen")
#q("Name three states of matter.", n: 7)[Solid, liquid and gas.]
```

```sh
loci study.typ
```

## Why?

Most flashcard apps want your cards inside their own database and their own
editor. That is fine for vocabulary, but painful the moment a card needs a
formula, a table or a diagram. Typst already does all of that well, it lives in
plain text files you can put into git, and it produces a good-looking PDF. loci
just adds the missing piece: a way to actually drill those questions.

## Installation

You need Go 1.27 or later and the `typst` CLI on your `PATH`.

```sh
go install github.com/npikall/loci
gotpm install github.com/npikall/loci//package
```

The first command installs the `loci` binary, the second installs the Typst
package into your local package directory so `@local/loci` resolves.

## Usage

```sh
loci study.typ                               # serve and open in the browser
loci --no-open --port 5000 study.typ         # fixed port, no browser
loci --theme gruvbox study.typ               # start with another color theme
typst compile study.typ                      # printable PDF with answers
typst compile --input answers=hide study.typ # sheet to test yourself on paper
```

There are three kinds of questions:

| Function | Question type                                     |
| -------- | ------------------------------------------------- |
| `sc`     | Single choice, exactly one `ok` option            |
| `mc`     | Multiple choice, at least one `ok` option         |
| `q`      | Free recall, reveal the answer and grade yourself |

Prompts, options and answers accept any Typst content, and headings become
sections you can filter by. All of them take a few optional arguments:

| Argument | On         | Meaning                                                    |
| -------- | ---------- | ---------------------------------------------------------- |
| `n`      | all        | How often the question was asked, e.g. in past exams       |
| `hint`   | all        | Help that can be opened before answering                   |
| `why`    | `sc`, `mc` | Explanation shown once the question is checked             |
| `vars`   | `q`        | Values drawn per seed, see [Random values](#random-values) |

For a tour of every feature have a look at
[`examples/example.typ`](examples/example.typ).

## Studying

- **Cards** asks one question at a time and brings a missed card back a few
  cards later. **List** shows the whole document, with search.
- A card is mastered after three right answers in a row. Right answers also push
  its next review further away: 1, 3, 7, 14, 30, then 60 days. The filter **Due
  for review** picks what is due today.
- **Flag** cards you want to come back to and study them with the filter
  **Flagged**.
- Press `?` for the keyboard shortcuts. Everything can be undone with `U`.

The page reloads itself when the file, or another file in its folder, changes.
Progress is stored in the browser, per file. **Menu › Export progress** writes
it to a file that **Import progress** reads back, on this or another machine.

## Themes

**Menu** has two pickers: the color theme and the mode, which is light, dark or
whatever your system prefers. Each theme has a light and a dark version:

| Theme         | Light          | Dark           |
| ------------- | -------------- | -------------- |
| `loci`        | loci light     | loci dark      |
| `catppuccin`  | Latte          | Mocha          |
| `gruvbox`     | light (medium) | dark (medium)  |
| `rose-pine`   | Dawn           | Main           |
| `tokyo-night` | Day            | Night          |
| `solarized`   | light          | dark           |
| `everforest`  | light (medium) | dark (medium)  |

`--theme NAME`, or the `LOCI_THEME` environment variable, sets the theme a file
starts with. Once you pick a theme in the browser, that choice wins. Like
progress, it is stored per file.

## Random values

`q` can draw the numbers of a question, so one file gives many versions of the
same exercise:

```typ
#q(
  vars: (a: range(2, 10), b: (0.5, 1.5, 2.5)),
  v => [A cart moves at #v.a m/s for #v.b s. How far does it get?],
  v => [#(v.a * v.b) m],
)
```

`vars` names arrays of candidates (numbers, text or any content). One value per
name is drawn, and `prompt`, `answer` and `hint` may be functions that take the
drawn values.

Which values are drawn is decided by a seed. It can be any text, for instance a
student's name:

```sh
typst compile --input seed=anna exam.typ anna.pdf
typst compile --input seed=anna --input answers=hide exam.typ anna-sheet.pdf
```

The same seed always gives the same values, so a sheet and its answer key match.
Without `--input seed` the seed is `0`, which is also what `loci` serves. Import
`seed` to print it on the sheet. Note that a draw depends on the seed, the
question's number and the variable's name, so adding or removing a question
before it changes its values.

## Printing

`answers` defaults to `show`. With `answers=hide` the PDF turns into a blank
sheet:

| Part       | With answers           | Without answers                        |
| ---------- | ---------------------- | -------------------------------------- |
| `sc`, `mc` | Correct options marked | No marks, options in a different order |
| `q`        | Answer printed         | Empty space to write in                |
| Notes      | `why`                  | `hint`                                 |

Options are reordered because the source lists the `ok` options first. The order
is fixed per question, so the sheet is the same on every compile. The flag only
affects the PDF; in the browser answers always stay hidden until you check or
reveal them.

## Development

```sh
go test ./...
bun test
```

## License and Links

- [Example document](examples/example.typ)
- [Typst](https://typst.app)
- License: MIT
