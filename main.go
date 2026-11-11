// Command loci renders a Typst study file to HTML and serves it locally.
package main

import (
	"bytes"
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"hash/fnv"
	"html"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
)

//go:embed web/loci.css
var css string

//go:embed web/loci.js
var js string

//go:embed web/loci-core.js
var core string

//go:embed web/loci-reload.js
var reload string

const usage = `usage: loci [--no-open] [--port N] <file.typ>

  --no-open   do not open the browser
  --port N    listen on port N instead of the port derived from the file path`

// options is what the command line asks for.
type options struct {
	path   string
	port   int
	noOpen bool
}

func parseArgs(args []string) (options, error) {
	var opts options
	flags := flag.NewFlagSet("loci", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.BoolVar(&opts.noOpen, "no-open", false, "")
	flags.IntVar(&opts.port, "port", 0, "")
	if err := flags.Parse(args); err != nil || flags.NArg() != 1 || filepath.Ext(flags.Arg(0)) != ".typ" {
		return opts, errors.New(usage)
	}
	if opts.port < 0 || opts.port > 65535 {
		return opts, errors.New(usage)
	}
	opts.path = flags.Arg(0)
	return opts, nil
}

func main() {
	if err := run(os.Args[1:], openBrowser); err != nil {
		fmt.Fprintln(os.Stderr, "loci:", err)
		os.Exit(1)
	}
}

func run(args []string, open func(string) error) error {
	opts, err := parseArgs(args)
	if err != nil {
		return err
	}
	path := opts.path
	if _, err := render(path); err != nil {
		return err
	}
	listener, err := listen(path, opts.port)
	if err != nil {
		return err
	}
	url := "http://" + listener.Addr().String()
	fmt.Println("serving", path, "at", url)
	if !opts.noOpen {
		if err := open(url); err != nil {
			fmt.Fprintln(os.Stderr, "loci: could not open browser:", err)
		}
	}
	load := func() ([]byte, error) { return render(path) }
	return http.Serve(listener, handler(load, func() string { return stamp(path) }))
}

// stamp changes whenever a file next to the document changes, so the page
// can reload itself. Watching the folder also covers included files and images.
func stamp(path string) string {
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		return ""
	}
	var latest int64
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil || entry.IsDir() {
			continue
		}
		latest = max(latest, info.ModTime().UnixNano())
	}
	return strconv.FormatInt(latest, 36) + "-" + strconv.Itoa(len(entries))
}

// stableAddr derives the port from the file path. Browsers scope saved
// progress by origin, so a file must come back on the same port every run.
func stableAddr(absPath string) string {
	h := fnv.New32a()
	h.Write([]byte(absPath))
	return fmt.Sprintf("127.0.0.1:%d", 49152+h.Sum32()%16384)
}

func listen(path string, port int) (net.Listener, error) {
	if port != 0 {
		return net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	}
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
	assets := `<link rel="icon" href="data:,"><style>` + css + `</style><script type="module">` + js + "</script><script>" + reload + "</script></head>"
	return bytes.Replace(page, []byte("</head>"), []byte(assets), 1), nil
}

// handler renders on every request, so reloading the page picks up edits.
// The page polls /stamp and reloads itself when the answer changes.
func handler(load func() ([]byte, error), stamp func() string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		page, err := load()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintf(w, "<!doctype html><title>loci: compile error</title><link rel=\"icon\" href=\"data:,\"><script>%s</script><pre>%s</pre>", reload, html.EscapeString(err.Error()))
			return
		}
		w.Write(page)
	})
	mux.HandleFunc("GET /loci-core.js", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		fmt.Fprint(w, core)
	})
	mux.HandleFunc("GET /stamp", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprint(w, stamp())
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
