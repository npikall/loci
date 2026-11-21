// Applies the saved theme and scheme before the first paint, so the page never
// flashes the default colors. loci.js validates both values once it loads and
// clears invalid ones. This runs before that module, so it reads storage itself.
(() => {
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const root = document.documentElement;
  root.dataset.theme = read("loci-theme") || document.currentScript.dataset.defaultTheme;
  root.dataset.scheme = read("loci-scheme") || "system";
})();
