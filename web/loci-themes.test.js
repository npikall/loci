import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { THEMES } from "./loci-core.js";

const css = readFileSync(new URL("./loci.css", import.meta.url), "utf8");
const goSource = readFileSync(new URL("../main.go", import.meta.url), "utf8");

const SLOTS = ["bg", "surface", "text", "muted", "line", "inverted", "primary", "right", "wrong"];
const MODES = ["light", "dark"];
// WCAG AA: body text needs 4.5:1, accents are mostly borders, chips and bold labels, so 3:1.
const MINIMUM = { text: 4.5, muted: 4.5, primary: 3, right: 3, wrong: 3 };

// Official palettes have no color that reaches the minimum for these slots, so the
// closest official color stays. An entry that starts passing must be removed.
const ACCEPTED = {
  "loci light muted": "the original default, kept as it was",
  "rose-pine light muted": "Dawn's subtle is its darkest grey",
  "tokyo-night light muted": "Day's fg_dark is its darkest grey after the text color",
  "solarized light right": "Solarized has a single green",
  "everforest light muted": "Light's grey2 is its darkest grey",
  "everforest light right": "Light's aqua is its darkest green-ish color",
};

/** Slot values per theme and mode, read from the :root blocks in loci.css. */
function palettes() {
  const result = {};
  for (const [, theme, body] of css.matchAll(/^:root(?:\[data-theme="([a-z-]+)"\])? \{([^}]*)\}/gm)) {
    const slots = {};
    for (const [, slot, light, dark] of body.matchAll(/--([a-z]+): light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\);/g)) {
      slots[slot] = { light, dark };
    }
    result[theme ?? "loci"] = slots;
  }
  return result;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test("contrast of a known pair matches WCAG", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
});

test("the server, the picker and the stylesheet offer the same themes", () => {
  const served = goSource.match(/var themes = \[\]string\{([^}]*)\}/)[1].match(/[a-z-]+/g);
  assert.deepEqual(served, Object.keys(THEMES));
  assert.deepEqual(Object.keys(palettes()).sort(), Object.keys(THEMES).sort());
});

test("every theme sets every color for light and dark", () => {
  for (const [theme, slots] of Object.entries(palettes())) {
    assert.deepEqual(Object.keys(slots).sort(), [...SLOTS].sort(), theme);
  }
});

test("every theme is readable on its page and card backgrounds", () => {
  const failures = [];
  for (const [theme, slots] of Object.entries(palettes())) {
    for (const mode of MODES) {
      for (const [slot, minimum] of Object.entries(MINIMUM)) {
        const ratio = Math.min(
          contrast(slots[slot][mode], slots.bg[mode]),
          contrast(slots[slot][mode], slots.surface[mode]),
        );
        const key = `${theme} ${mode} ${slot}`;
        if (ratio < minimum && !ACCEPTED[key]) failures.push(`${key}: ${ratio.toFixed(2)} < ${minimum}`);
        if (ratio >= minimum && ACCEPTED[key]) failures.push(`${key} now reaches ${minimum}, remove it from ACCEPTED`);
      }
    }
  }
  assert.deepEqual(failures, []);
});
