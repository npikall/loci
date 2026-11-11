package main

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"
)

// usePackage makes @local/loci:0.1.0 resolve to this repository's package.
func usePackage(t *testing.T) {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "local", "loci")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	pkg, err := filepath.Abs("package")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(pkg, filepath.Join(dir, "0.1.0")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TYPST_PACKAGE_PATH", root)
}

func TestRenderProducesQuestionMarkup(t *testing.T) {
	usePackage(t)
	page, err := render("testdata/study.typ")
	if err != nil {
		t.Fatal(err)
	}
	html := string(page)
	for _, want := range []string{
		`<input type="checkbox" name="loci-1" value="ok">`,
		`<input type="checkbox" name="loci-1" value="err">`,
		`<input type="radio" name="loci-2" value="ok">`,
		`<input type="radio" name="loci-2" value="err">`,
		`carrot`,
		`The answer is 4.`,
		`The answer is 9.`,
		`<details class="loci-answer">`,
	} {
		if !strings.Contains(html, want) {
			t.Errorf("rendered page lacks %q:\n%s", want, html)
		}
	}
}

func TestRenderIncludesStyleAndScript(t *testing.T) {
	usePackage(t)
	page, err := render("testdata/study.typ")
	if err != nil {
		t.Fatal(err)
	}
	head, _, found := strings.Cut(string(page), "</head>")
	if !found {
		t.Fatalf("no head in page: %s", page)
	}
	if !strings.Contains(head, css) || !strings.Contains(head, js) || !strings.Contains(head, reload) {
		t.Error("head lacks embedded style or script")
	}
}

func TestRenderReportsTypstDiagnostics(t *testing.T) {
	_, err := render("testdata/broken.typ")
	if err == nil || !strings.Contains(err.Error(), "unknown variable") {
		t.Fatalf("want typst diagnostic, got %v", err)
	}
}

func TestRunRejectsBadArguments(t *testing.T) {
	for _, args := range [][]string{nil, {"a.typ", "b.typ"}, {"--help"}, {"notes.md"}, {"--port", "x", "a.typ"}, {"--port", "70000", "a.typ"}, {"--bogus", "a.typ"}} {
		err := run(args, nil)
		if err == nil || !strings.Contains(err.Error(), "usage") {
			t.Errorf("run(%q) = %v, want usage error", args, err)
		}
	}
}

func TestRunReportsRenderFailure(t *testing.T) {
	err := run([]string{"testdata/broken.typ"}, func(string) error {
		t.Error("browser opened for a broken document")
		return nil
	})
	if err == nil {
		t.Fatal("want error")
	}
}

// visit runs loci with a fake browser that fetches the URL it is given and
// whose launch returns launchErr. It returns the URL and the fetched body.
func visit(t *testing.T, launchErr error) (string, string) {
	t.Helper()
	usePackage(t)
	type visited struct{ url, body string }
	result := make(chan visited, 1)
	go run([]string{"testdata/study.typ"}, func(url string) error {
		go func() {
			res, err := http.Get(url)
			if err != nil {
				result <- visited{url, err.Error()}
				return
			}
			defer res.Body.Close()
			b, _ := io.ReadAll(res.Body)
			result <- visited{url, string(b)}
		}()
		return launchErr
	})
	got := <-result
	return got.url, got.body
}

func TestRunServesRenderedPageToOpenedBrowser(t *testing.T) {
	if _, body := visit(t, nil); !strings.Contains(body, "carrot") {
		t.Fatalf("browser did not receive the study: %s", body)
	}
}

func TestRunListensOnLoopbackOnly(t *testing.T) {
	if url, _ := visit(t, nil); !strings.HasPrefix(url, "http://127.0.0.1:") {
		t.Fatalf("served on %s", url)
	}
}

func TestRunKeepsServingWhenBrowserFails(t *testing.T) {
	if _, body := visit(t, errors.New("no browser")); !strings.Contains(body, "carrot") {
		t.Fatalf("study not served: %s", body)
	}
}

func noStamp() string { return "" }

func staticPage(body string) func() ([]byte, error) {
	return func() ([]byte, error) { return []byte(body), nil }
}

func get(h http.Handler, target, host string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", target, nil)
	req.Host = host
	h.ServeHTTP(rec, req)
	return rec
}

func TestHandlerServesPageAsHTML(t *testing.T) {
	rec := get(handler(staticPage("<p>hi</p>"), noStamp), "/", "127.0.0.1:1")
	if rec.Code != http.StatusOK || rec.Body.String() != "<p>hi</p>" {
		t.Fatalf("got %d %q", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("content type %q", got)
	}
}

func TestHandlerReturnsNotFoundForOtherPaths(t *testing.T) {
	rec := get(handler(staticPage(""), noStamp), "/favicon.ico", "127.0.0.1:1")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestHandlerRendersEveryRequestSoEditsAppearOnReload(t *testing.T) {
	version := 0
	h := handler(func() ([]byte, error) {
		version++
		return []byte(strconv.Itoa(version)), nil
	}, noStamp)
	get(h, "/", "127.0.0.1:1")
	if got := get(h, "/", "127.0.0.1:1").Body.String(); got != "2" {
		t.Fatalf("second load served %q", got)
	}
}

func TestHandlerShowsTypstErrorsInBrowser(t *testing.T) {
	h := handler(func() ([]byte, error) { return nil, errors.New("bad <thing>") }, noStamp)
	rec := get(h, "/", "127.0.0.1:1")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "bad &lt;thing&gt;") {
		t.Errorf("diagnostics missing or unescaped: %s", rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("content type %q", got)
	}
}

func TestHandlerServesCoreModuleAsJavaScript(t *testing.T) {
	rec := get(handler(staticPage(""), noStamp), "/loci-core.js", "127.0.0.1:1")
	if rec.Code != http.StatusOK || rec.Body.String() != core {
		t.Fatalf("got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/javascript; charset=utf-8" {
		t.Errorf("content type %q", got)
	}
}

func TestHandlerRejectsForeignHosts(t *testing.T) {
	h := handler(staticPage("secret"), noStamp)
	for _, host := range []string{"evil.example:8080", "8.8.8.8:8080"} {
		if rec := get(h, "/", host); rec.Code != http.StatusForbidden {
			t.Errorf("%s got %d", host, rec.Code)
		}
	}
	for _, host := range []string{"127.0.0.1:5000", "localhost:5000", "localhost", "[::1]:5000"} {
		if rec := get(h, "/", host); rec.Code != http.StatusOK {
			t.Errorf("%s got %d", host, rec.Code)
		}
	}
}

func TestStableAddrIsLoopbackAndDependsOnlyOnPath(t *testing.T) {
	a, b := stableAddr("/notes/a.typ"), stableAddr("/notes/b.typ")
	if a != stableAddr("/notes/a.typ") {
		t.Error("same file got different addresses")
	}
	if a == b {
		t.Errorf("different files share %s", a)
	}
	host, port, err := net.SplitHostPort(a)
	if err != nil || host != "127.0.0.1" {
		t.Fatalf("addr %q: %v", a, err)
	}
	if n, _ := strconv.Atoi(port); n < 49152 || n > 65535 {
		t.Errorf("port %d outside the dynamic range", n)
	}
}

func TestListenReusesPortOfSameFileAcrossRuns(t *testing.T) {
	first, err := listen("testdata/listen-a.typ", 0)
	if err != nil {
		t.Fatal(err)
	}
	addr := first.Addr().String()
	first.Close()
	second, err := listen("testdata/listen-a.typ", 0)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	if got := second.Addr().String(); got != addr {
		t.Errorf("second run on %s, first on %s", got, addr)
	}
}

func TestListenFallsBackWhenPortIsTaken(t *testing.T) {
	first, err := listen("testdata/listen-b.typ", 0)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := listen("testdata/listen-b.typ", 0)
	if err != nil {
		t.Fatalf("second listener: %v", err)
	}
	defer second.Close()
	if second.Addr().String() == first.Addr().String() {
		t.Error("two listeners on one address")
	}
}

func TestRenderEmitsFrequencyForSorting(t *testing.T) {
	usePackage(t)
	page, err := render("testdata/study.typ")
	if err != nil {
		t.Fatal(err)
	}
	html := string(page)
	if !strings.Contains(html, `data-n="7"`) || !strings.Contains(html, "7×") {
		t.Errorf("frequency missing:\n%s", html)
	}
}

func TestRenderRejectsNonIntegerFrequency(t *testing.T) {
	usePackage(t)
	_, err := render("testdata/bad-frequency.typ")
	if err == nil || !strings.Contains(err.Error(), "positive integer") {
		t.Fatalf("want frequency diagnostic, got %v", err)
	}
}

func TestBrowserCommand(t *testing.T) {
	const url = "http://127.0.0.1:1"
	for goos, want := range map[string][]string{
		"darwin":  {"open", url},
		"linux":   {"xdg-open", url},
		"windows": {"rundll32", "url.dll,FileProtocolHandler", url},
	} {
		if got := browserCommand(goos, url); !slices.Equal(got, want) {
			t.Errorf("%s: got %q, want %q", goos, got, want)
		}
	}
}

func TestParseArgsReadsFlags(t *testing.T) {
	opts, err := parseArgs([]string{"--no-open", "--port", "5123", "notes.typ"})
	if err != nil {
		t.Fatal(err)
	}
	if want := (options{path: "notes.typ", port: 5123, noOpen: true}); opts != want {
		t.Errorf("got %+v, want %+v", opts, want)
	}
}

func TestRunDoesNotOpenBrowserWhenAskedNotTo(t *testing.T) {
	usePackage(t)
	opened := make(chan struct{}, 1)
	go run([]string{"--no-open", "--port", "0", "testdata/study.typ"}, func(string) error {
		opened <- struct{}{}
		return nil
	})
	select {
	case <-opened:
		t.Fatal("browser opened despite --no-open")
	case <-time.After(1500 * time.Millisecond):
	}
}

func TestListenUsesRequestedPort(t *testing.T) {
	probe, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := probe.Addr().(*net.TCPAddr).Port
	probe.Close()
	listener, err := listen("testdata/study.typ", port)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	if got := listener.Addr().(*net.TCPAddr).Port; got != port {
		t.Errorf("listening on %d, want %d", got, port)
	}
}

func TestHandlerServesStampUncached(t *testing.T) {
	rec := get(handler(staticPage(""), func() string { return "v1" }), "/stamp", "127.0.0.1:1")
	if rec.Code != http.StatusOK || rec.Body.String() != "v1" {
		t.Fatalf("got %d %q", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("cache control %q", got)
	}
}

func TestStampChangesWhenFolderChanges(t *testing.T) {
	dir := t.TempDir()
	doc := filepath.Join(dir, "notes.typ")
	if err := os.WriteFile(doc, []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	before := stamp(doc)
	if before != stamp(doc) {
		t.Fatal("stamp changed without an edit")
	}
	if err := os.WriteFile(filepath.Join(dir, "included.typ"), []byte("b"), 0o644); err != nil {
		t.Fatal(err)
	}
	if stamp(doc) == before {
		t.Error("stamp ignored a new file next to the document")
	}
	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(doc, later, later); err != nil {
		t.Fatal(err)
	}
	if after := stamp(doc); after == before {
		t.Error("stamp ignored an edit")
	}
}

func TestErrorPageReloadsItselfOnceFixed(t *testing.T) {
	h := handler(func() ([]byte, error) { return nil, errors.New("bad") }, noStamp)
	if body := get(h, "/", "127.0.0.1:1").Body.String(); !strings.Contains(body, reload) {
		t.Errorf("error page lacks the reload script: %s", body)
	}
}

func TestRenderEmitsHintAndExplanation(t *testing.T) {
	usePackage(t)
	page, err := render("testdata/study.typ")
	if err != nil {
		t.Fatal(err)
	}
	html := string(page)
	for _, want := range []string{`<details class="loci-tip">`, `Glows in signs.`, `<div class="loci-why">Group 18.</div>`, `<details class="loci-answer">`} {
		if !strings.Contains(html, want) {
			t.Errorf("rendered page lacks %q", want)
		}
	}
}
