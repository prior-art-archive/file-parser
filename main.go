package main

import (
	"encoding/json"
	"log"
	"net/http"
)

var awsPrefix = "https://s3.amazonaws.com/prior-art-archive-testing/tika/dioptics.pdf"
var tikaMetaURL = "http://tika:9998/meta"
var tikaTextURL = "http://tika:9998/tika"

func main() {
	http.HandleFunc("/new", handler)
	http.ListenAndServe(":8080", nil)
}

func handler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var records []*record
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&records)
		if err != nil {
			// hmm
		}
		for _, record := range records {
			awsURL := awsPrefix + record.S3.Bucket.Name + "/" + record.S3.Object.Key

			// Text extraction
			textRequest, err := putText(awsURL)
			if err != nil {
				log.Println(err)
				continue
			}

			// Metadata extraction
			metaRequest, err := putMeta(awsURL)
			if err != nil {
				log.Println(err)
				continue
			}

			defer textRequest.Body.Close()
			defer metaRequest.Body.Close()
		}
	}
}

func putMeta(awsURL string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodPut, tikaMetaURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("fileUrl", awsURL)
	req.Header.Set("Accept", "application/json")
	return http.DefaultClient.Do(req)
}

func putText(awsURL string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodPut, tikaMetaURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("fileUrl", awsURL)
	req.Header.Set("Accept", "text/plain")
	return http.DefaultClient.Do(req)
}
