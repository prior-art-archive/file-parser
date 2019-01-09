const express = require("express")

const rp = require("request-promise-native")
const IPFS = require("ipfs-http-client")
const AWS = require("aws-sdk")

AWS.config.update({ region: "us-east-1" })
const s3 = new AWS.S3({ apiVersion: "2006-03-01" })

const { IPFS_URL, CONFIGURATION_ID } = process.env

if (!IPFS_URL || !CONFIGURATION_ID) {
	console.error("Not all environment variables set:", {
		IPFS_URL,
		CONFIGURATION_ID,
	})
	process.exit(1)
}

const validate = require("./validate.js")
const assembleAssertion = require("./assembleAssertion")
const { Organization, Document, Assertion, sequelize } = require("./database")

const ipfs = IPFS(IPFS_URL)
const { Buffer } = ipfs.types

const TikaUrl = "http://tika"
const DocumentIdKey = "x-amz-meta-document-id"
const OriginalFilenameKey = "x-amz-meta-original-filename"

const IpfsOptions = { pin: true }
const IpldOptions = {
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

	// Rock on
	request.body.forEach(({ eventTime, s3: { bucket, object } }) =>
		s3.getObject(
			{ Bucket: bucket.name, Key: object.key },
			async (err, data) => {
				if (err) return console.error(err)
				const { Body, ContentLength, ContentType, Metadata } = data
				const {
					[DocumentIdKey]: documentId,
					[OriginalFilenameKey]: originalFilename,
				} = Metadata

				const formData = { [originalFilename]: Body }

				const [organizationId, fileId] = key.split("/")
				const fileUrl = `https://s3.amazonaws.com/${bucket.name}/${object.key}` // ???
				// These are default properties for the Document in case we have to create one
				const defaults = { organizationId, fileUrl }

				const metaRequest = {
					url: `${TIKA_URL}/meta/form`,
					headers: { Accept: "application/json" },
					formData,
				}

				const textRequest = {
					url: `${TIKA_URL}/tika/form`,
					headers: { Accept: "text/plain" },
					formData,
				}

				// Now we have a bunch of stuff to do all at once!

				// The original file and extracted text are added to IPFS as regular files (bytes).
				// The metadata is added to *IPLD* as cbor-encoded JSON. This is more compact but also
				// lets us address paths into the JSON object when we talk about provenance (!!!).

				// `fileResult` and `textResult` are both {path: string, hash: string, size: number},
				// but `metaCid` is a CID instance with a .toBaseEncodedString() method.
				// The reason file & text are wrapped in an extra array is that IPFS supports
				// adding multiple files or directories, so it always returns an array of every "file added".
				// `meta` is the actual JSON metadata object parsed from Tika; we return it from a second Promise.all
				const startTime = new Date()
				const [
					[document, created],
					[fileResult],
					[meta, metaCid],
					[textResult],
				] = await Promise.all([
					// we need to create a new document, or get the existing one.
					Document.findOrCreate({ where: { id: documentId }, defaults }),
					// we need to add the uploaded file to IPFS
					ipfs.add(ipfs.types.Buffer.from(Body), IpfsOptions),
					// we need to post the file to Tika's text extraction service, and add the result to IPFS
					rp
						.put(textRequest)
						.then(text => ipfs.add(Buffer.from(text), IpfsOptions)),
					// we also need to post the file to Tika's metadata service, and add the result to IPFS
					rp
						.put(metaRequest)
						.then(body => JSON.parse(body))
						.then(meta => Promise.all([meta, ipfs.dag.put(meta, IpldOptions)])),
				])

				if (meta) {
					await document.update({ title: meta.title }, {})
				}

				const assertion = await assembleAssertion({
					eventTime,
					documentId,
					fileUrl,
					fileName,
					fileResult,
					metadata: meta,
					metaCid,
					textResult,
					generatedAtTime: startTime.toISOString(),
				})

				const [result] = await ipfs.add(ipfs.types.Buffer.from(assertion))
			}
		)
	)
})

app.listen(8080)
