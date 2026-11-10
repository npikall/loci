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
loci study.typ            # serve and open in the browser
typst compile study.typ   # printable PDF
```

| Function | Question type                                     |
| -------- | ------------------------------------------------- |
| `sc`     | Single choice, exactly one `ok` option            |
| `mc`     | Multiple choice, at least one `ok` option         |
| `q`      | Free recall, reveal the answer and grade yourself |

Prompts, options and answers accept any Typst content. The optional `n` records
how often a question was asked, for example in past exams. Headings become
sections you can filter by. See `examples/example.typ` for a tour of every
feature.

Reload the page to pick up edits. Progress is saved in the browser, per file.

## Development

```sh
go test ./...
bun test
```
