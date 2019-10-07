const uuidv4 = require("uuid/v4")
const IPFS = require("ipfs-http-client")
const Sequelize = require("sequelize")
const elasticsearch = require("elasticsearch")
const fetch = require("node-fetch")
const FormData = require("form-data")

const { Buffer } = IPFS

const assemble = require("./assemble")

const {
	subdomain,
	DocumentIdKey,
	OriginalFilenameKey,
	MetaRequest,
	TextRequest,
	FileNames,
	ContentTypes,
} = require("./constants")

const { decorateIndexWithLegacyProperties } = require("./utils")

const { IPFS_HOST, DATABASE_URL, ELASTIC_URL } = process.env

const ipfs = IPFS({ host: IPFS_HOST, port: 443, protocol: "https" })

const sequelize = new Sequelize(DATABASE_URL, {
	logging: false,
	dialectOptions: { ssl: true },
})

var elastic = new elasticsearch.Client({ host: ELASTIC_URL })

const Document = sequelize.import("./models/Documents.js")
const Assertion = sequelize.import("./models/Assertions.js")

ipfs
	.id()
	.then(id => console.log("connected to IPFS node with id", id))
	.catch(err => {
		console.error("Failed to connect to IPFS node", err)
		process.exit(1)
	})

module.exports = async function(eventTime, Bucket, Key, data) {
	const { Body, ContentLength, ContentType, Metadata } = data
	const {
		[DocumentIdKey]: documentId,
		[OriginalFilenameKey]: fileName,
	} = Metadata

	const fileUrl = `https://${Bucket}/${Key}`
	const [uploads, organizationId, fileId] = Key.split("/")

	const bytes = Buffer.from(Body)

	const [{ hash: fileCid }] = await ipfs.add(bytes, {
		onlyHash: true,
		"cid-version": 1,
	})

	const previous = await Assertion.findOne({
		where: { organizationId, fileCid },
	})

	// If the there's already an assertion with the same file hash and organization ID,
	// just return the documentId and cid of that assertion right away.
	if (previous !== null) {
		const { id, documentId, organizationId, cid, fileCid } = previous
		return { id, documentId, organizationId, cid, fileCid }
	}

	// These are default properties for the Document in case we have to create one
	const defaults = {
		id: documentId,
		organizationId,
		fileUrl,
		contentType: ContentType,
	}

	const metaForm = new FormData()
	const tikaForm = new FormData()
	metaForm.append(fileName, Body)
	tikaForm.append(fileName, Body)

	// prov:generatedAtTime for the metadata and transcript
	const startTime = new Date()

	const [[document, created], metadata, transcript] = await Promise.all([
		// create a new document, or get the existing one.
		Document.findOrCreate({ where: { id: documentId }, defaults }),
		// post the file to Tika's text extraction service
		fetch(MetaRequest.url, {
			method: "POST",
			body: metaForm,
			headers: MetaRequest.headers,
		}).then(res => res.text()),
		// post the file to Tika's metadata service
		fetch(TextRequest.url, {
			method: "POST",
			body: tikaForm,
			headers: TextRequest.headers,
		}).then(res => res.text()),
	])

	const [
		{ hash: transcriptCid, size: transcriptSize },
		{ hash: metadataCid, size: metadataSize },
	] = await ipfs.add([Buffer.from(transcript), Buffer.from(metadata)], {
		onlyHash: true,
		"cid-version": 1,
	})

	const generatedAtTime = startTime.toISOString()

	const assertionPayload = {
		eventTime,
		documentId,
		contentLength: ContentLength,
		contentType: ContentType,
		generatedAtTime,
		fileName,
		fileUrl,
		fileCid,
		transcriptCid,
		transcriptSize: transcriptSize + "B",
		metadata,
		metadataCid,
		metadataSize: metadataSize + "B",
	}

	const {
		assertion,
		title: newTitle,
		language: newLanguage,
		publicationDate: newPublicationDate,
	} = await assemble(assertionPayload)

	let filePath = fileCid + (ContentTypes[ContentType] || "")

	const results = await ipfs.add(
		[
			{ path: filePath, content: bytes },
			{ path: FileNames.transcript, content: Buffer.from(transcript) },
			{ path: FileNames.metadata, content: Buffer.from(metadata) },
			{ path: FileNames.assertion, content: Buffer.from(assertion) },
		],
		{
			pin: false,
			"cid-version": 1,
			wrapWithDirectory: true,
		}
	)

	if (results.length !== 5 || results[4].path !== "") {
		throw new Error("Unexpected result from IPFS")
	}

	const { hash: cid } = results[4]

	const id = uuidv4()

	const metaKeys = {
		src: `${subdomain}.priorartarchive.org`,
		assertion: id,
		document: documentId,
		organization: organizationId,
	}

	const queryString = Object.keys(metaKeys)
		.map(key => `meta-${key}=${metaKeys[key]}`)
		.join("&")

	await fetch(`http://${IPFS_HOST}:9094/pins/${cid}?${queryString}`, {
		method: "POST",
	})

	const elasticIndex = {
		text: transcript,
		fileUrl,
		organizationId,
		uploadDate: eventTime,
		contentLength: ContentLength,
		contentType: ContentType,
	}

	const title = newTitle || document.title
	const publicationDate = newPublicationDate
	const language = newLanguage

	if (title) {
		elasticIndex.title = title
	}

	if (publicationDate) {
		elasticIndex.publicationDate = publicationDate
	}

	if (language) {
		elasticIndex.language = language
	}

	const decoratedElasticIndex = decorateIndexWithLegacyProperties(elasticIndex)

	await Promise.all([
		Assertion.create({
			id,
			documentId,
			organizationId,
			cid,
			fileCid,
			fileName,
		}),
		document.update({
			title,
			fileUrl,
			contentType: ContentType,
			language,
			publicationDate,
		}),
		elastic.index({
			index: "documents",
			type: "doc",
			id: documentId,
			body: decoratedElasticIndex,
		}),
	])

	return { id, documentId, organizationId, cid, fileCid }
}
