// Reloads the page when the server reports that the document changed.
// It also runs on the compile-error page, so fixing the file brings the cards back.
(() => {
  let known = null;
  async function poll() {
    if (document.hidden) return;
    try {
      const response = await fetch("/stamp", { cache: "no-store" });
      if (!response.ok) return;
      const stamp = await response.text();
      if (known !== null && stamp !== known) location.reload();
      known = stamp;
    } catch {
      // The server is gone; keep the page usable and try again later.
    }
  }
  setInterval(poll, 1000);
  poll();
})();
