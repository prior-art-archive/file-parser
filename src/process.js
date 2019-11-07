const crypto = require("crypto")
const uuidv4 = require("uuid/v4")
const request = require("request-promise-native")
const Sequelize = require("sequelize")

// const elasticsearch = require("elasticsearch")

const getMetadata = require("./metadata")

const {
	DocumentIdKey,
	OriginalFilenameKey,
	MetaRequest,
	TextRequest,
} = require("./constants")

const {
	DATABASE_URL,
	// ELASTIC_URL,
	NODE_ENV,
} = process.env
const PROD = NODE_ENV === "production"
console.log("environment:", NODE_ENV, PROD)

const sequelize = new Sequelize(DATABASE_URL, {
	logging: false,
	dialectOptions: { ssl: true },
})

// const elastic = ELASTIC_URL
// 	? new elasticsearch.Client({ host: ELASTIC_URL })
// 	: null

const Document = sequelize.import("./models/Documents.js")
const Assertion = sequelize.import("./models/Assertions.js")
const Organization = sequelize.import("./models/Organizations.js")

const getFileUrl = path => `https://assets.priorartarchive.org/${path}`

module.exports = async function(eventTime, Bucket, Key, data) {
	const { Body, ContentLength, ContentType, Metadata } = data
	const {
		[DocumentIdKey]: documentId,
		[OriginalFilenameKey]: fileName,
	} = Metadata

	const [uploads, organizationId, fileId] = Key.split("/")
	const fileUrl = getFileUrl(Key)

	// compute md5 hash of the file for legacy reasons.
	const md5Hash = crypto
		.createHash("md5")
		.update(Body)
		.digest("hex")

	const fileCid = multihash.toB58String(
		multihash.encode(
			crypto
				.createHash("sha256")
				.update(Body)
				.digest(),
			"sha2-256"
		)
	)

	// These are default properties for the Document in case we have to create one
	const defaults = {
		id: documentId,
		organizationId,
		fileUrl,
		contentType: ContentType,
	}

	const formData = { [fileName]: Body }

	const previous = await Assertion.findOne({
		where: { organizationId, fileCid },
	})

	// If the there's already an assertion with the same file hash and organization ID,
	// just return the documentId and cid of that assertion right away.
	if (previous !== null) {
		const { documentId, cid } = previous
		return { documentId, cid }
	}

	// Now we have a bunch of stuff to do all at once!
	const startTime = new Date() // prov:generatedAtTime for the metadata and transcript
	const [[document], text, meta] = await Promise.all([
		// we need to create a new document, or get the existing one.
		Document.findOrCreate({ where: { id: documentId }, defaults }),
		// we need to post the file to Tika's text extraction service
		request.post({ formData, ...TextRequest }),
		// we need to post the file to Tika's metadata service
		request.post({ formData, ...MetaRequest }).then(body => JSON.parse(body)),
	])

	const organization = await Organization.findByPk(organizationId)

	const customMetadata = await getMetadata(Body, ContentType).catch(error => {
		console.error("Error parsing custom metadata:", error)
		return {}
	})

	const legacyDateString =
		customMetadata.PushDate || customMetadata.Date || customMetadata.UploadDate

	const title = meta.title || document.title

	const legacyBody = {
		url: fileUrl,
		fileId: md5Hash,
		title: customMetadata.title || customMetadata.Title,
		description: customMetadata.description || customMetadata.Description,
		dateUploaded: document.createdAt,
		datePublished: Date.parse(legacyDateString)
			? new Date(legacyDateString)
			: undefined,
		companyId: organizationId,
		companyName: organization.name,
		sourcePath: Key,
	}

	if (!PROD) {
		console.log("Posting to kafka:", legacyBody)
	}

	const apiUrl = "https://api.priorartarchive.org"
	request({
		method: "POST",
		uri: `${apiUrl}/assets/kafka`,
		json: true,
		body: legacyBody,
	})
		.then(response => {
			if (!PROD) {
				console.log("Kafka response:", response)
			}
		})
		.catch(error => {
			console.error("Error posting to legacy Kafka:", error)
		})

	// if (elastic !== null) {
	// const generatedAtTime = startTime.toISOString()
	// const dateString =
	// 	meta.PushDate || meta.Date || meta.UploadDate || meta.created
	// 	const elasticIndex = {
	// 		title,
	// 		text,
	// 		fileUrl,
	// 		organizationId,
	// 		uploadDate: generatedAtTime,
	// 		contentLength: ContentLength,
	// 		contentType: ContentType,
	// 	}

	// 	if (Date.parse(dateString)) {
	// 		const date = new Date(dateString)
	// 		elasticIndex.publicationDate = date.toISOString()
	// 	}

	// 	if (meta.hasOwnProperty("language")) {
	// 		elasticIndex.language = meta["langauge"]
	// 	}
	// 	elastic.index({
	// 		index: "documents",
	// 		type: "doc",
	// 		id: documentId,
	// 		body: elasticIndex,
	// 	})
	// }

	Assertion.create({
		id: uuidv4(),
		fileCid,
		documentId,
		organizationId,
	})

	document.update({ title, fileUrl, fileName, contentType: ContentType })

	return { documentId }
}
