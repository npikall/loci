# https://just.systems
set default-list := true

bin := "loci"

#run the linter
lint:
    go vet ./...

#run the formatter
fmt:
    go fmt ./...

#run the tests
test:
    go test ./...

#build the binary
build:
    go build -o {{ bin }} .

#install the binary on the system
install:
    go install -ldflags="-s -w" .
