# loci

Study questions written in [Typst](https://typst.app), practised in the browser.

`loci` compiles a `.typ` file to HTML and serves it locally as flashcards. The
same file also compiles to a printable PDF.

## Install

Requires Go 1.27+ and the `typst` CLI on your `PATH`.

```sh
go install .
```

Copy the Typst package to your local package directory:

```sh
gotpm install package/
```

## Usage

```typ
#import "@local/loci:0.1.0": mc, q, sc

= Chemistry

#sc("What is the chemical symbol of sodium?", ok: "Na", err: ("So", "S"))
#mc("Which are noble gases?", ok: ("Helium", "Neon"), err: "Oxygen")
#q("Name three states of matter.", n: 7)[Solid, liquid and gas.]
```

```sh
loci study.typ                               # serve and open in the browser
loci --no-open --port 5000 study.typ         # fixed port, no browser
typst compile study.typ                      # printable PDF with answers
typst compile --input answers=hide study.typ # sheet to test yourself on paper
```

| Function | Question type                                     |
| -------- | ------------------------------------------------- |
| `sc`     | Single choice, exactly one `ok` option            |
| `mc`     | Multiple choice, at least one `ok` option         |
| `q`      | Free recall, reveal the answer and grade yourself |

Prompts, options and answers accept any Typst content. Headings become
sections you can filter by. See `examples/example.typ` for a tour of every
feature.

| Argument | On           | Meaning                                                 |
| -------- | ------------ | ------------------------------------------------------- |
| `n`      | all          | How often the question was asked, e.g. in past exams    |
| `hint`   | all          | Help that can be opened before answering                |
| `why`    | `sc`, `mc`   | Explanation shown once the question is checked          |

## Studying

- **Cards** asks one question at a time and brings a missed card back a few
  cards later. **List** shows the whole document, with search.
- A card is mastered after three right answers in a row. Right answers also
  push its next review further away: 1, 3, 7, 14, 30, then 60 days. The filter
  **Due for review** picks what is due today.
- **Flag** cards you want to come back to and study them with the filter
  **Flagged**.
- Press `?` for the keyboard shortcuts. Everything can be undone with `U`.

The page reloads itself when the file, or another file in its folder, changes.
Progress is saved in the browser, per file. **Menu › Export progress** writes
it to a file that **Import progress** reads back, on this or another machine.

## Development

```sh
go test ./...
bun test
```
