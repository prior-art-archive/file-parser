const fs = require("fs")

const jsonld = require("jsonld")

const Papa = require("papaparse")

const { MetaRequest, TextRequest, subdomain } = require("./constants")

const jsonldOptions = { algorithm: "URDNA2015", format: "application/n-quads" }

const tikaReference =
	"dweb:/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7"

// tikaTextRole is {"@type": "prov:Role", "schema:urlTemplate": "/tika/form"}
const tikaTextRole = tikaReference + "#_:c14n21"
// tikaMetaRole is {"@type": "prov:Role", "schema:urlTemplate": "/meta/form"}
const tikaMetaRole = tikaReference + "#_:c14n61"
// tikaSoftwareAgent is {"@type": "prov:SoftwareAgent"}
const tikaSoftwareAgent = tikaReference + "#_:c14n29"

const getGatewayUrl = cid => "https://gateway.underlay.store/ipfs/" + cid
const getDocumentUrl = id =>
	`https://${subdomain}.priorartarchive.org/doc/${id}`

// ### IMPORTANT ###
// URIs should not use www subdomains and should not use https.
// - https://www.w3.org/TR/cooluris/ (no www)
// - https://www.w3.org/DesignIssues/Security-NotTheS.html (no https)
// This is an *identifier in a namespace*, not a URL, and the actual URL
// will be included as a property of this URI in every assertion.
// If we ever get DOIs for our documents we should switch to those instead.
const getDocumentUri = id => `http://priorartarchive.org/doc/${id}`

// schema.org has its own weird primitive datatypes like schema:Text
// but we don't actually use them.
// const makeText = value => ({ "@value": value, "@type": "schema:Text" })
const makeText = value => ({ "@value": value })
// const makeUrl = value => ({ "@value": value, "@type": "schema:URL" })
const makeUrl = value => ({ "@value": value })
const makeDate = value => ({
	"@value": value,
	"@type": "http://www.w3.org/2001/XMLSchema#dateTime",
})

// see https://gist.github.com/joeltg/f066945ee780bfee769a26cea753f255 for background
const context = JSON.parse(fs.readFileSync("./tika-context.json"))
const contextKeys = Object.keys(context)

// Tika does this infuriating thing where it outputs every metadata value
// as a string, even "true" and "false". Papa.parse is configured to coerce
// booleans, numbers, and dates into native JavaScript types ¯\_(ツ)_/¯
// TODO: look closely at the specs for the Adobe PDF ontology to check if
// this is actually what is supposed to happen (maybe the rdfs:range of their
// boolean properties is actually an rdf:Alt of "true"^^xsd:String and "false"^^xsd:String)

async function parseRDFProperties(metadata, documentUri, fileUri) {
	const { data, errors, meta } = Papa.parse(metadata, {
		delimiter: ",",
		newline: "\n",
		skipEmptyLines: true,
		dynamicTyping: true,
	})

	if (errors && errors.length > 0) {
		throw new Error(`Could not parse metadata: ${JSON.stringify(errors)}`)
	}

	// "fileProperties" are whichever miscellaneous RDF values that Tika extracted
	// in the /meta/form service. Some are from the Dublin Core ontology, but there
	// is also stuff from all of Adobe's PDF properties, Word document meta, etc...
	// If they exist, they're included as properties of the original schema:MediaObject file.
	const fileProperties = { "@id": fileUri }

	// "documentProperties" are *known* values that correspond to columns
	// in the Postgres database (right now only "title", "langauge", and some dates)
	// We manually translate this into a schema.org property of the
	// containing schema:DigitalDocument.
	const documentProperties = { "@id": documentUri }

	// results is the object we eventually return to process.js.
	// It holds the document title, language, and publication date.
	const results = {}

	data.forEach(([key, value]) => {
		if (contextKeys.some(prefix => key.indexOf(prefix + ":") === 0)) {
			if (value instanceof Date) {
				fileProperties[key] = makeDate(value.toISOString())
			} else {
				fileProperties[key] = value
			}
		} else if (key === "title") {
			results.title = value
			documentProperties["schema:name"] = makeText(value)
		} else if (key === "language") {
			results.language = value
			documentProperties["schema:inLanguage"] = makeText(value)
		} else if (key === "date" && value instanceof Date) {
			results.publicationDate = value.toISOString()
			documentProperties["schema:datePublished"] = makeDate(value.toISOString())
		} else if (key === "created" && value instanceof Date) {
			documentProperties["schema:dateCreated"] = makeDate(value.toISOString())
		} else if (key === "modified" && value instanceof Date) {
			documentProperties["schema:dateModified"] = makeDate(value.toISOString())
		}
	})

	const tikaGraph = []

	if (Object.keys(fileProperties).length > 1) {
		tikaGraph.push(fileProperties)
	}

	if (Object.keys(documentProperties).length > 1) {
		tikaGraph.push(documentProperties)
	}

	return [results, tikaGraph]
}

module.exports = async function({
	eventTime,
	documentId,
	contentLength,
	contentType,
	generatedAtTime,
	fileUrl: fileUrlS3, // we'll also have a fileUrl from the IPFS gateway
	fileName,
	fileCid,
	transcriptCid,
	transcriptSize,
	metadata,
	metadataCid,
	metadataSize,
}) {
	const documentUri = getDocumentUri(documentId)
	const documentUrl = getDocumentUrl(documentId)
	const fileUri = `dweb:/ipfs/${fileCid}`
	const fileUrlIPFS = getGatewayUrl(fileCid)
	const fileSize = contentLength + "B"
	const metadataUri = `dweb:/ipfs/${metadataCid}`
	const metadataUrl = getGatewayUrl(metadataCid)
	const transcriptUri = `dweb:/ipfs/${transcriptCid}`
	const transcriptUrl = getGatewayUrl(transcriptCid)

	// tikaAssertionGraph is the graph of properties that we will attribute to Tika
	const [results, tikaGraph] = await parseRDFProperties(
		metadata,
		documentUri,
		fileUri
	)

	const tikaGraphContainer = []
	if (tikaGraph.length > 0) {
		tikaGraphContainer.push({
			"@type": "prov:Entity",
			"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
			"prov:wasDerivedFrom": { "@id": metadataUri },
			"@graph": tikaGraph,
		})
	}

	/*
	Okay so here's the real assertion. It relates four main objects:
	- The Document
	- The File
	- The Transcript
	- The Metadata.
	*/
	const assertion = {
		"@context": {
			prov: "http://www.w3.org/ns/prov#",
			schema: "http://schema.org/",
			xsd: "http://www.w3.org/2001/XMLSchema#",
			// schema:encodesCreativeWork and schema:associatedMedia are inverses of each other;
			// we explicitly include both directions.
			encodedBy: { "@reverse": "schema:encodesCreativeWork" },
			"schema:associatedMedia": { "@type": "@id" },
		},
		"@graph": [
			// This is either [] (adds nothing to the graph when spread)
			// or [{@context, @graph: [...stuff-from-tika[]}] (adds one object)
			...tikaGraphContainer,
			{
				"@id": documentUri,
				"@type": "schema:DigitalDocument",
				"schema:mainEntity": { "@id": fileUri },
				"schema:transcript": { "@id": transcriptUri },
				"schema:url": makeUrl(documentUrl),
				"schema:associatedMedia": [fileUri, metadataUri, transcriptUri],
				encodedBy: [
					{
						"@id": fileUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": [makeUrl(fileUrlIPFS), makeUrl(fileUrlS3)],
						"schema:contentSize": makeText(fileSize),
						"schema:encodingFormat": makeText(contentType),
						"schema:name": makeText(fileName),
						"schema:mainEntityOfPage": { "@id": documentUri },
						"schema:uploadDate": makeDate(eventTime),
					},
					{
						"@id": transcriptUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": makeUrl(transcriptUrl),
						"schema:contentSize": makeText(transcriptSize),
						"schema:encodingFormat": makeText(TextRequest.headers.Accept),
						"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
						"prov:generatedAtTime": {
							"@value": generatedAtTime,
							"@type": "xsd:dateTime",
						},
						"prov:wasGeneratedBy": {
							"@type": "prov:Activity",
							"prov:generated": { "@id": transcriptUri },
							"prov:used": { "@id": fileUri },
							"prov:wasAssociatedWith": { "@id": tikaSoftwareAgent },
							"prov:qualifiedAssociation": {
								"@type": "prov:Association",
								"prov:agent": { "@id": tikaSoftwareAgent },
								"prov:hadRole": { "@id": tikaTextRole },
							},
						},
					},
					{
						"@id": metadataUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": makeUrl(metadataUrl),
						"schema:contentSize": makeText(metadataSize),
						"schema:encodingFormat": makeText(MetaRequest.headers.Accept),
						"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
						"prov:generatedAtTime": generatedAtTime,
						"prov:wasGeneratedBy": {
							"@type": "prov:Activity",
							"prov:generated": { "@id": metadataUri },
							"prov:used": { "@id": fileUri },
							"prov:wasAssociatedWith": { "@id": tikaSoftwareAgent },
							"prov:qualifiedAssociation": {
								"@type": "prov:Association",
								"prov:agent": { "@id": tikaSoftwareAgent },
								"prov:hadRole": { "@id": tikaMetaRole },
							},
						},
					},
				],
			},
		],
	}

	return {
		assertion: await jsonld.canonize(assertion, jsonldOptions),
		...results,
	}
}
