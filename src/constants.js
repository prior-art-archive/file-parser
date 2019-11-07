const DocumentIdKey = "document-id"
const OriginalFilenameKey = "original-filename"

const TikaUrl = "http://tika:9998" // This container is "linked" to the Tika container

const MetaRequest = {
	url: `${TikaUrl}/meta/form`,
	headers: { Accept: "application/json" },
}

const TextRequest = {
	url: `${TikaUrl}/tika/form`,
	headers: { Accept: "text/plain" },
}

module.exports = {
	DocumentIdKey,
	OriginalFilenameKey,
	MetaRequest,
	TextRequest,
}
