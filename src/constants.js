const { NODE_ENV, TIKA_URL } = process.env
const subdomain = NODE_ENV === "development" ? "dev" : "www"

const DocumentIdKey = "document-id"
const OriginalFilenameKey = "original-filename"

// This container is "linked" to the Tika container

const MetaRequest = {
	url: `${TIKA_URL}/meta/form`,
	headers: { Accept: "text/csv" },
}

const TextRequest = {
	url: `${TIKA_URL}/tika/form`,
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
