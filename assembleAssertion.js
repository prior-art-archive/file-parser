const fs = require("fs")

const jsonld = require("jsonld")

const jsonldOptions = { algorithm: "URDNA2015", format: "application/n-quads" }

const blankDocumentId = "_:document"

const tikaReference =
	"dweb:/ipfs/QmScWKwDmJP9nVou2jVVCtRLQQNcWBMXwoJnoa4RULL8wn"
const tikaTextRole = tikaReference + "#_:c14n13"
const tikaMetaRole = tikaReference + "#_:c14n45"
const tikaSoftwareAgent = tikaReference + "#_:c14n74"

// You've really gotta admire the character breaks that line up here!
const getGatewayUrl = cid => "https://gateway.underlay.store/ipfs/" + cid
const getDocumentUrl = id => "https://www.priorartarchive.org/doc/" + id

// see https://gist.github.com/joeltg/f066945ee780bfee769a26cea753f255 for background
const context = JSON.parse(fs.readFileSync("./static/tika-context.json"))

function getRDFProperties(metadata, id) {
	const rdf = { "@context": context, "@id": id }
	Object.keys(metadata).forEach(
		property =>
			Object.keys(context).find(
				prefix => property.indexOf(prefix + ":") === 0
			) && (rdf[property] = metadata[property])
	)
	return rdf
}

function getSchemaProperties(metadata, id) {
	const schemaProperties = { "@id": id }
	if (metadata.hasOwnProperty("title")) {
		schemaProperties["schema:name"] = metadata["title"]
	}

	if (metadata.hasOwnProperty("Content-Type")) {
		schemaProperties["schema:encodingFormat"] = metadata["Content-Type"]
	}
	return schemaProperties
}

async function assembleAssertion({
	eventTime,
	documentId,
	fileUrl: fileUrlS3, // we'll also have a fileUrl from the IPFS gateway
	fileName,
	fileResult,
	metadata,
	metadataCid,
	textResult,
	generatedAtTime,
}) {
	const fileUri = `dweb:/ipfs/${fileResult.hash}`
	const fileUrlIPFS = getGatewayUrl(fileResult.hash) // See I told you
	const fileSize = fileResult.size + "B"
	const metaUri = `dweb:/ipfs/${metadataCid.toBaseEncodedString()}`
	const textUri = `dweb:/ipfs/${textResult.hash}`
	const textUrl = getGatewayUrl(textResult.hash)
	const textSize = textResult.size + "B"

	// tikaAssertionGraph is the graph of properties that we will attribute to Tika
	const tikaAssertionGraph = []

	// "rdfProperties" are whichever miscellaneous RDF values that Tika extracted
	// in the /meta service. They're usually from the Dublin Core ontology, but
	// also RDF all of Adobe's PDF properties, Word document metadata, etc...
	// If they exist, they're inserted in the tikaAssertionGraph as properties of
	// the *original file's* schema:MediaObject.
	const rdfProperties = getRDFProperties(metadata, fileUri)
	// rdfProperties is empty if it only has two keys (@context and @id)
	if (Object.keys(rdfProperties).length > 2) {
		tikaAssertionGraph.push(await jsonld.compact(rdfProperties, null))
	}

	// "schemaProperties" are *known* values that correspond to columns
	// in the Postgres database (title, content-type, etc...)
	// We manually translate these into schema.org properties and insert
	// them into tikaAssertionGraph as properties of the containing DigitalDocument
	const schemaProperties = getSchemaProperties(metadata, blankDocumentId)
	// but schemaProperties is empty if it only has one key since it carries no @context
	if (Object.keys(schemaProperties).length > 1) {
		tikaAssertionGraph.push(schemaProperties)
	}

	const tikaAssertionContainer = []
	if (tikaAssertionGraph.length > 0) {
		tikaAssertionContainer.push({
			"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
			"prov:wasDerivedFrom": { "@id": metaUri },
			"@graph": tikaAssertionGraph,
		})
	}

	// Okay so here's the real assertion
	const assertion = {
		"@context": {
			prov: "http://www.w3.org/ns/prov#",
			schema: "http://schema.org/",
			// schema:encodesCreativeWork and schema:associatedMedia are inverses of each other;
			// we explicitly include both directions.
			encodedBy: { "@reverse": "schema:encodesCreativeWork" },
			"schema:associatedMedia": { "@type": "@id" },
		},
		"@graph": [
			// This is either [] (adds nothing to the graph when spread)
			// or [{@context, @graph: [...stuff-from-tika[]}] (adds one object)
			...tikaAssertionContainer,
			{
				"@id": blankDocumentId,
				"@type": "schema:DigitalDocument",
				"schema:mainEntity": { "@id": fileUri },
				"schema:transcript": { "@id": textUri },
				"schema:url": getDocumentUrl(documentId),
				"schema:associatedMedia": [fileUri, metaUri, textUri],
				encodedBy: [
					{
						"@id": fileUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentSize": fileSize,
						"schema:contentUrl": [fileUrlIPFS, fileUrlS3],
						"schema:name": fileName,
						"schema:mainEntityOfPage": { "@id": blankDocumentId },
						"schema:uploadDate": eventTime,
					},
					{
						"@id": textUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": textUrl,
						"schema:contentSize": textSize,
						"schema:encodingFormat": "text/plain",
						"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
						"prov:generatedAtTime": generatedAtTime,
						"prov:wasGeneratedBy": {
							"@type": "prov:Activity",
							"prov:generated": { "@id": textUri },
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
						"@id": metaUri,
						"@type": ["prov:Entity"],
						"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
						"prov:generatedAtTime": generatedAtTime,
						"prov:wasGeneratedBy": {
							"@type": "prov:Activity",
							"prov:generated": { "@id": metaUri },
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
	return jsonld.canonize(assertion, jsonldOptions)
}

module.exports = assembleAssertion
