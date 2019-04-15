const { NODE_ENV } = process.env
const subdomain = NODE_ENV === "development" ? "dev" : "www"

const DocumentIdKey = "document-id"
const OriginalFilenameKey = "original-filename"

// This container is "linked" to the Tika container
const TikaUrl = "http://tika:9998"

const MetaRequest = {
	url: `${TikaUrl}/meta/form`,
	headers: { Accept: "text/csv" },
}

const TextRequest = {
	url: `${TikaUrl}/tika/form`,
	headers: { Accept: "text/plain" },
}

const FileNames = {
	transcript: "transcript.txt",
	metadata: "metadata.csv",
	assertion: "assertion.nt",
}

const ContentTypes = {
	"text/plain": ".txt",
	"text/html": ".html",
	"application/pdf": ".pdf",
}

module.exports = {
	subdomain,
	DocumentIdKey,
	OriginalFilenameKey,
	MetaRequest,
	TextRequest,
	FileNames,
	ContentTypes,
}
