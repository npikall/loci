// Command loci renders a Typst study file to HTML and serves it locally.
package main

import (
	"bytes"
	_ "embed"
	"errors"
	"fmt"
	"hash/fnv"
	"html"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

//go:embed web/loci.css
var css string

//go:embed web/loci.js
var js string

//go:embed web/loci-core.js
var core string

func main() {
	if err := run(os.Args[1:], openBrowser); err != nil {
		fmt.Fprintln(os.Stderr, "loci:", err)
		os.Exit(1)
	}
}

func run(args []string, open func(string) error) error {
	if len(args) != 1 || filepath.Ext(args[0]) != ".typ" {
		return errors.New("usage: loci <file.typ>")
	}
	path := args[0]
	if _, err := render(path); err != nil {
		return err
	}
	listener, err := listen(path)
	if err != nil {
		return err
	}
	url := "http://" + listener.Addr().String()
	fmt.Println("serving", path, "at", url)
	if err := open(url); err != nil {
		fmt.Fprintln(os.Stderr, "loci: could not open browser:", err)
	}
	return http.Serve(listener, handler(func() ([]byte, error) { return render(path) }))
}

// stableAddr derives the port from the file path. Browsers scope saved
// progress by origin, so a file must come back on the same port every run.
func stableAddr(absPath string) string {
	h := fnv.New32a()
	h.Write([]byte(absPath))
	return fmt.Sprintf("127.0.0.1:%d", 49152+h.Sum32()%16384)
}

func listen(path string) (net.Listener, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp", stableAddr(abs))
	if err != nil {
		fmt.Fprintln(os.Stderr, "loci: usual port is taken, progress from earlier runs is not available:", err)
		return net.Listen("tcp", "127.0.0.1:0")
	}
	return listener, nil
}

// render compiles to stdout, so nothing is left on disk after shutdown.
func render(path string) ([]byte, error) {
	var stderr bytes.Buffer
	cmd := exec.Command("typst", "compile", "--features", "html", "--format", "html", path, "-")
	cmd.Stderr = &stderr
	page, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("typst: %w\n%s", err, stderr.String())
	}
	assets := "<style>" + css + `</style><script type="module">` + js + "</script></head>"
	return bytes.Replace(page, []byte("</head>"), []byte(assets), 1), nil
}

// handler renders on every request, so reloading the page picks up edits.
func handler(load func() ([]byte, error)) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		page, err := load()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintf(w, "<!doctype html><title>loci: compile error</title><pre>%s</pre>", html.EscapeString(err.Error()))
			return
		}
		w.Write(page)
	})
	mux.HandleFunc("GET /loci-core.js", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		fmt.Fprint(w, core)
	})
	return localOnly(mux)
}

// localOnly rejects requests whose Host is not a loopback name. The port is
// predictable, so a website could otherwise read the notes via DNS rebinding.
func localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host
		}
		if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func openBrowser(url string) error {
	command := browserCommand(runtime.GOOS, url)
	return exec.Command(command[0], command[1:]...).Start()
}

func browserCommand(goos, url string) []string {
	switch goos {
	case "darwin":
		return []string{"open", url}
	case "windows":
		return []string{"rundll32", "url.dll,FileProtocolHandler", url}
	default:
		return []string{"xdg-open", url}
	}
}
