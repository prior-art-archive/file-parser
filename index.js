const express = require("express")

const uuidv4 = require("uuid/v4")
const request = require("request-promise-native")
const IPFS = require("ipfs-http-client")
const AWS = require("aws-sdk")

AWS.config.update({ region: "us-east-1" })
const s3 = new AWS.S3({ apiVersion: "2006-03-01" })

const { IPFS_URL } = process.env
if (!IPFS_URL) {
	console.error("IPFS URL not set")
	process.exit(1)
}

const validate = require("./validate.js")
const assembleAssertion = require("./assembleAssertion")
const { Document, Assertion } = require("./database")

const ipfs = IPFS(IPFS_URL)
const { Buffer } = ipfs.types

const TikaUrl = "http://tika:9998" // This container is "linked" to the Tika container
const DocumentIdKey = "document-id"
const OriginalFilenameKey = "original-filename"

const getFileUrl = path => `https://assets.priorartarchive.org/${path}`

const IpfsOptions = { pin: true }
const IpldOptions = { format: "dag-cbor", hashAlg: "sha2-256" }

const app = express()
app.use(express.json())
app.post("/new", async function(req, res) {
	// Validate the request body
	if (!validate(req.body)) {
		res.statusCode = 400
		res.json({ error: "Request did not pass validation" })
		res.end()
		return
	}

	Promise.all(
		req.body.Records.map(
			({ eventTime, s3: { bucket, object } }) =>
				new Promise((resolve, reject) =>
					s3.getObject(
						{ Bucket: bucket.name, Key: object.key },
						(err, data) => {
							if (err !== null) return reject(err)
							const { Body, ContentLength, ContentType, Metadata } = data
							console.log(
								{ Bucket: bucket.name, Key: object.key },
								{ ContentLength, ContentType, Metadata }
							)
							const {
								[DocumentIdKey]: documentId,
								[OriginalFilenameKey]: fileName,
							} = Metadata

							const [uploads, organizationId, fileId] = object.key.split("/")
							const fileUrl = getFileUrl(object.key)

							// These are default properties for the Document in case we have to create one
							const defaults = { id: uuidv4(), organizationId }

							const formData = { [fileName]: Body }

							const metaRequest = {
								url: `${TikaUrl}/meta/form`,
								headers: { Accept: "application/json" },
								formData,
							}

							const textRequest = {
								url: `${TikaUrl}/tika/form`,
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
							Promise.all([
								// we need to create a new document, or get the existing one.
								Document.findOrCreate({
									where: { id: documentId },
									defaults,
								}).catch(reject),
								// we need to add the uploaded file to IPFS
								ipfs
									.add(Buffer.from(Body), IpfsOptions)
									.catch(err => console.log("it was THIS ONE") || reject(err)),
								// we need to post the file to Tika's text extraction service, and add the result to IPFS
								request
									.post(textRequest)
									.catch(reject)
									.then(
										text =>
											console.log("wow we got the text", text.length) ||
											ipfs
												.add(Buffer.from(text), IpfsOptions)
												.then(res => console.log("look the text:", res) || res),
										reject
									),
								// we also need to post the file to Tika's metadata service, and add the result to IPFS
								request
									.post(metaRequest)
									.catch(reject)
									.then(
										body =>
											console.log("look at this metadata", body) ||
											JSON.parse(body),
										reject
									)
									.then(
										meta =>
											Promise.all([
												meta,
												ipfs.dag
													.put(meta, IpldOptions)
													.catch(
														err =>
															console.log("IT WAS THE OTHER ONE", meta) ||
															reject(err)
													),
											]),
										reject
									),
							])
								.then(
									([
										[document, created],
										[fileResult],
										[textResult],
										[meta, metaCid],
									]) =>
										Promise.all([
											document
												.update({
													title: meta.title || document.title,
													fileUrl,
													fileName,
												})
												.catch(reject),
											assembleAssertion({
												eventTime,
												documentId,
												contentSize: ContentLength,
												contentType: ContentType,
												fileUrl,
												fileName,
												fileResult,
												metadata: meta,
												metadataCid: metaCid,
												textResult,
												generatedAtTime: startTime.toISOString(),
											})
												.then(
													assertion =>
														console.log(
															"about to add canonized assertion",
															assertion
														) ||
														ipfs
															.add(Buffer.from(assertion))
															.catch(
																err =>
																	console.log("IT DID'T FREAKING WORK") ||
																	reject(err)
															),
													reject
												)
												.then(
													([result]) => {
														const props = {
															id: uuidv4(),
															cid: result.hash,
															documentId,
															organizationId,
														}
														console.log("props!", props)
														return Assertion.create(props)
													},
													err =>
														console.error("what happened here", err) ||
														reject(err)
												)
												.then(
													({ cid }) => resolve(cid),
													err =>
														console.error("wfjkdlsjfkldj", err) || reject(err)
												),
										]).catch(reject),
									reject
								)
								.catch(reject)
						}
					)
				)
		)
	).then((assertions, error) => {
		if (error) {
			console.error("encountered an error:", error)
			res.statusCode = 500
			res.json({ error })
		} else {
			console.log("successfully wrote assertions", assertions)
			res.statusCode = 200
			res.json(assertions)
		}
		res.end()
	})
})

app.listen(8080, err =>
	err ? console.error(err) : console.log("Listening on port 8080")
)
