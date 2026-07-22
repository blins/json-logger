package main

import (
	"bytes"
	"log"
	"net/http"
)

type EndpointLogger interface {
	Put(string) error
}

type Token interface {
	Check(string) bool
}

type Endpoint struct {
	Name      string
	AuthToken Token
	Handler   EndpointLogger
}

func (e *Endpoint) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.WriteHeader(405)
		s := `{"statusCode": 405, "error": "Method Not Allowed"}`
		w.Write([]byte(s))
		return
	}
	if e.AuthToken != nil {
		token := r.Header.Get("Authorization")
		if !e.AuthToken.Check(token) {
			w.WriteHeader(403)
			s := `{"statusCode": 403, "error": "Forbidden"}`
			w.Write([]byte(s))
			return
		}
	}
	buff := bytes.Buffer{}
	buff.ReadFrom(r.Body)
	jString := buff.String()
	// check valid json ?!

	if err := e.Handler.Put(jString); err != nil {
		w.WriteHeader(500)
		s := `{"statusCode": 500, "error": "` + err.Error() + `"}`
		w.Write([]byte(s))
		return
	}
	w.WriteHeader(202)
	s := `{"statusCode": 202, "error": ""}`
	w.Write([]byte(s))
}

type Logger interface {
	Println(...any)
}

type LoggerWrapper struct {
	Logger
}

func (l LoggerWrapper) Put(jString string) error {
	l.Println(jString)
	return nil
}

func NewStdLogger(channel string) LoggerWrapper {
	return LoggerWrapper{
		log.New(log.Default().Writer(), "["+channel+"] ", log.LstdFlags|log.Lmsgprefix),
	}
}

type TokenString string

func (t TokenString) Check(s string) bool {
	return s == string(t)
}
