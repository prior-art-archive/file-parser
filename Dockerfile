FROM golang:alpine

WORKDIR /go/src/github.com/underlay/tika-server
ADD main.go .
RUN go build main.go
RUN mv main /go/bin/.

ENTRYPOINT /go/bin/main
