FROM golang:1.25-alpine AS build

#ENV GOPRIVATE=
WORKDIR /application
COPY . /application

RUN go mod download && \
    go mod verify && \
    go build -o json-logger

FROM alpine:latest

COPY --from=build /application/json-logger /usr/local/bin/
ADD config.docker.yaml /etc/json-logger/config.yaml

ENTRYPOINT ["/usr/local/bin/json-logger"]

EXPOSE 8080

CMD ["-config","/etc/json-logger/config.yaml"]