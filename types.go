package main

type record struct {
	AwsRegion    string    `json:"awsRegion"`
	EventName    string    `json:"eventName"`
	EventSource  string    `json:"eventSource"`
	EventTime    string    `json:"eventTime"`
	EventVersion string    `json:"eventVersion"`
	S3           *s3       `json:"s3"`
	UserIdentity *identity `json:"userIdentity"`
}

type identity struct {
	PrincipalID string `json:"principalId"`
}

type s3 struct {
	Bucket          *bucket `json:"bucket"`
	ConfigurationID string  `json:"configurationId"`
	Object          *object `json:"object"`
	S3SchemaVersion string  `json:"s3SchemaVersion"`
}

type bucket struct {
	Arn           string    `json:"arn"`
	Name          string    `json:"name"`
	OwnerIdentity *identity `json:"ownerIdentity"`
}

type object struct {
	ETag      string `json:"eTag"`
	Key       string `json:"key"`
	Sequencer string `json:"sequencer"`
	Size      int    `json:"size"`
}
