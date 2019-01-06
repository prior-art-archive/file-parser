package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"

	ipfs "github.com/ipfs/go-ipfs-api"
)

var awsOrigin = "https://s3.amazonaws.com"
var tikaMetaURL = "http://tika:9998/meta"
var tikaTextURL = "http://tika:9998/tika"

var shell = ipfs.NewShell("https://cluster.underlay.store")

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
			awsURL := fmt.Sprintf("%s/%s/%s", awsOrigin, record.S3.Bucket.Name, record.S3.Object.Key)

			// Text extraction
			textRequest, err := putText(awsURL)
			if err != nil {
				log.Println(err)
				continue
			}
			defer textRequest.Body.Close()
			textCid, err := shell.Add(textRequest.Body)
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
			defer metaRequest.Body.Close()

			bytes, err := ioutil.ReadAll(metaRequest.Body)
			if err != nil {
				log.Println(err)
				continue
			}
			metaCid, err := shell.DagPut(bytes, "json", "cbor")
			if err != nil {
				log.Println(err)
				continue
			}

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
