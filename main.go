package main

import (
	"flag"
	"io"
	"net/http"
	"os"

	"go.yaml.in/yaml/v2"
)

var httpBind string

// to test it
// curl -X PUT -H "Content-Type: application/json" -d '{"key": "value", "another": "thing"}' http://localhost:8080/api/log/std

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // По умолчанию разрешаем всё
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept")

		// Обработка preflight-запроса (OPTIONS)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r) // Дальше обрабатываем реальный запрос
	})
}

type ConfigEndpointLogger struct {
	Type    string
	Options map[string]any
}

type ConfigEndpoint struct {
	Name   string
	Logger ConfigEndpointLogger
}

type Config struct {
	Endpoints []*ConfigEndpoint
}

var config Config

func main() {
	var configFile string = "config.yaml"
	flag.StringVar(&configFile, "config", configFile, "config file")

	flag.Parse()

	f, err := os.Open(configFile)
	if err != nil {
		panic(err)
	}
	data, err := io.ReadAll(f)
	if err != nil {
		panic(err)
	}
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		panic(err)
	}

	if httpBind == "" {
		httpBind = ":8080"
	}

	for _, ec := range config.Endpoints {
		lfc := ec.Logger.Type
		if lf, ok := EndpointLoggerRegistry[lfc]; ok {
			lh := lf.New(ec.Logger.Options)
			if closer, ok := lh.(io.Closer); ok {
				defer closer.Close()
			}
			e := &Endpoint{
				Name:    ec.Name,
				Handler: lh,
			}
			http.Handle("/api/log/"+e.Name, e)
		} else {
			panic("logger " + lfc + "not found")
		}
	}
	http.Handle("/static/", http.FileServer(http.FS(staticFiles)))
	http.ListenAndServe(httpBind, corsMiddleware(http.DefaultServeMux))
}
