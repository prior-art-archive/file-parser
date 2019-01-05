package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	http.HandleFunc("/new", handler)
	http.ListenAndServe(":8080", nil)
}

func handler(w http.ResponseWriter, r *http.Request) {
	var v interface{}
	if r.Method == http.MethodPost {
		decoder := json.NewDecoder(r.Body)
		decoder.Decode(&v)
		bytes, _ := json.MarshalIndent(v, "", "  ")
		fmt.Fprint(os.Stderr, string(bytes))
	} else {
		url := r.URL.Query().Get("q")
		fmt.Fprintf(w, "Page = %q\n", url)
	}
}
