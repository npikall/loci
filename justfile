# https://just.systems
set default-list := true

bin := "loci"
ex := "examples/example.typ"

#run the linter
lint:
    go vet ./...

#run the formatter
fmt:
    go fmt ./...

#run the tests
test:
    go test ./...
    node --test web/

# run the server
run *args=ex:
    go run . {{ args }}

#build the binary
build:
    go build -o {{ bin }} .

#install the binary on the system
install:
    go install -ldflags="-s -w" .
