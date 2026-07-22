package main

import "net/http"

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

func main() {
	if httpBind == "" {
		httpBind = ":8080"
	}
	e := &Endpoint{
		Name:    "std",
		Handler: NewStdLogger("STD"),
	}

	http.Handle("/static/", http.FileServer(http.FS(staticFiles)))
	http.Handle("/api/log/"+e.Name, e)
	http.ListenAndServe(httpBind, corsMiddleware(http.DefaultServeMux))
}
