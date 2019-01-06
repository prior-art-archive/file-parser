const express = require("express")

const rp = require("request-promise-native")
const IPFS = require("ipfs-http-client")

const { IPFS_URL, TIKA_URL, CONFIGURATION_ID } = process.env

if (!IPFS_URL || !TIKA_URL || !CONFIGURATION_ID) {
	console.error("Not all environment variables set:", { IPFS_URL, TIKA_URL })
	process.exit(1)
}

const validate = require("./validate.js")
const assembleAssertion = require("./assembleAssertion")

const ipfs = IPFS(IPFS_URL)
const { Buffer } = ipfs.types

const AWS_ORIGIN = "https://s3.amazonaws.com"
const TIKA_URL = "http://tika"

const IPFS_OPTIONS = { pin: true }
const IPLD_OPTIONS = {
	format: "dag-cbor",
	hashAlg: "sha2-256",
}

const app = express()
app.use(express.json())
app.post("/new", function(request, response) {
	// Validate the request body
	if (!validate(request.body)) {
		response.statusCode = 400
		response.end()
		return
	}

	request.body.forEach(async ({ eventTime, s3 }) => {
		const {
			bucket: { name },
			object: { key, size },
		} = s3

		const uri = `${AWS_ORIGIN}/${name}/${key}`
		const headers = { fileUrl: uri }

		// The original file and extracted text are added to IPFS as regular files (bytes).
		// The JSON metadata is added to *IPLD* as cbor-encoded JSON. This is a) more compact but also
		// b) lets us address paths into the JSON object for when we want to talk about provenance.
		// So e.g. we can say that the prov of something is `ipfs:/dweb/zkfjhashbytes.../path/through/json/metadata`
		// and we can retrieve just that part of the metadata with ipfs.dag.get("zkfjhashbytes.../path/through/json/metadata").

		// fileResult and textResult are {path: string, hash: string, size: number}
		// but metaCid is a CID instance with a .toBaseEncodedString() method.
		// The reason file & text are wrapped in an extra array is that IPFS supports
		// adding multiple files or directories, so it always returns an array of every "file added".
		const [[fileResult], metaCid, [textResult]] = await Promise.all([
			rp
				.get({ uri, resolveWithFullResponse: true })
				.then(file => ipfs.add(Buffer.from(file.body), IPFS_OPTIONS)),
			rp
				.put({ url: `${TIKA_URL}/meta`, headers, json: true })
				.then(meta => ipfs.dag.put(meta, IPLD_OPTIONS)),
			rp
				.put({ url: `${TIKA_URL}/text`, headers })
				.then(text => ipfs.add(Buffer.from(text), IPFS_OPTIONS)),
		])

		// Hooray! Now we can assemble the actual assertion.
	})
})

app.listen(80)
