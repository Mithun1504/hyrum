FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod ./
COPY cmd cmd
COPY internal internal
ARG VERSION=dev
ARG COMMIT=unknown
RUN go test ./... && go vet ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X github.com/hyrum-dev/hyrum/internal/buildinfo.version=${VERSION} -X github.com/hyrum-dev/hyrum/internal/buildinfo.commit=${COMMIT}" -o /out/hyrum-agent ./cmd/hyrum-agent
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X github.com/hyrum-dev/hyrum/internal/buildinfo.version=${VERSION} -X github.com/hyrum-dev/hyrum/internal/buildinfo.commit=${COMMIT}" -o /out/hyrum-replay ./cmd/hyrum-replay

FROM alpine:3.22
RUN apk add --no-cache ca-certificates docker-cli && addgroup -S hyrum && adduser -S -G hyrum hyrum
COPY --from=builder /out/hyrum-agent /usr/local/bin/hyrum-agent
COPY --from=builder /out/hyrum-replay /usr/local/bin/hyrum-replay
USER hyrum
ENTRYPOINT ["hyrum-agent"]
