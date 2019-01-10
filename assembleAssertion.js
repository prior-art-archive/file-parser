const fs = require("fs")

const jsonld = require("jsonld")

const jsonldOptions = { algorithm: "URDNA2015", format: "application/n-quads" }

const tikaReference =
	"dweb:/ipfs/QmScWKwDmJP9nVou2jVVCtRLQQNcWBMXwoJnoa4RULL8wn"
const tikaTextRole = tikaReference + "#_:c14n13"
const tikaMetaRole = tikaReference + "#_:c14n45"
const tikaSoftwareAgent = tikaReference + "#_:c14n74"

// You've really gotta admire the character breaks that line up here!
const getGatewayUrl = cid => "https://gateway.underlay.store/ipfs/" + cid
const getDocumentUrl = id => "https://www.priorartarchive.org/doc/" + id

// URIs should not use www. subdomains and should not use https.
// (https://www.w3.org/TR/cooluris/ and https://www.w3.org/DesignIssues/Security-NotTheS.html, respectively)
// This is an identifier in a namespace, not a URL, and the actual URL
// will be included as a property of this URI in all assertions.
// If we ever get DOIs for our documents we should switch to those instead.
const getDocumentUri = id => "http://priorartarchive.org/doc/" + id // whaaaa

// see https://gist.github.com/joeltg/f066945ee780bfee769a26cea753f255 for background
const context = JSON.parse(fs.readFileSync("./static/tika-context.json"))
const contextKeys = Object.keys(context)

// "rdfProperties" are whichever miscellaneous RDF values that Tika extracted
// in the /meta service. They're usually from the Dublin Core ontology, but
// also RDF all of Adobe's PDF properties, Word document metadata, etc...
// If they exist, they're included as properties of the original schema:MediaObject file.
function getRDFProperties(metadata, id) {
	const rdfKeys = Object.keys(metadata).filter(key =>
		contextKeys.find(prefix => key.indexOf(prefix + ":") === 0)
	)
	if (rdfKeys.length > 0) {
		// Need to include the context for this subgraph since
		// we're likely using a bunch of weird foriegn namespaces
		const rdf = { "@context": context, "@id": id }
		rdfKeys.forEach(key => (rdf[key] = metadata[key]))
		return rdf
	} else {
		return null
	}
}

// "schemaProperties" are *known* values that correspond to columns
// in the Postgres database (right now only `title`.)
// We manually translate this into a schema.org property of the
// containing schema:DigitalDocument.
function getSchemaProperties(metadata, id) {
	if (metadata.hasOwnProperty("title")) {
		// No need for a context since we're only using the schema: prefix
		return { "@id": id, "schema:name": metadata["title"] }
	} else {
		return null
	}
}

async function assembleAssertion({
	eventTime,
	documentId,
	contentType,
	contentSize,
	fileUrl: fileUrlS3, // we'll also have a fileUrl from the IPFS gateway
	fileName,
	fileResult,
	metadata,
	metadataCid,
	textResult,
	generatedAtTime,
}) {
	console.log("holy shit", {
		eventTime,
		documentId,
		contentType,
		contentSize,
		fileUrl: fileUrlS3,
		fileName,
		fileResult,
		metadata,
		metadataCid,
		textResult,
		generatedAtTime,
	})
	const documentUri = getDocumentUri(documentId)
	const documentUrl = getDocumentUrl(documentId)
	const fileUri = `dweb:/ipfs/${fileResult.hash}`
	const fileUrlIPFS = getGatewayUrl(fileResult.hash) // See I told you
	const fileSize = contentSize + "B"
	const metaUri = `dweb:/ipfs/${metadataCid.toBaseEncodedString()}`
	const textUri = `dweb:/ipfs/${textResult.hash}`
	const textUrlIPFS = getGatewayUrl(textResult.hash)
	const textSize = textResult.size + "B"

	// tikaAssertionGraph is the graph of properties that we will attribute to Tika
	const tikaGraph = []

	const rdfProperties = getRDFProperties(metadata, fileUri)
	if (rdfProperties !== null) {
		tikaGraph.push(await jsonld.expand(rdfProperties))
	}

	const schemaProperties = getSchemaProperties(metadata, documentUri)
	if (schemaProperties !== null) {
		tikaGraph.push(schemaProperties)
	}

	const tikaGraphContainer = []
	if (tikaGraph.length > 0) {
		tikaGraphContainer.push({
			"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
			"prov:wasDerivedFrom": { "@id": metaUri },
			"@graph": tikaGraph,
		})
	}

	/*
	Okay so here's the real assertion. It relates four main objects:
	1. The Document
		This is of type schema:DigitalDocument with a URI http://priorartarchive.org/doc/<documentId>.
		This is *
	2. The File
	3. The Transcript
	4. The Metadata.
	
	*/
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
			...tikaGraphContainer,
			{
				"@id": documentUri,
				"@type": "schema:DigitalDocument",
				"schema:mainEntity": { "@id": fileUri },
				"schema:transcript": { "@id": textUri },
				"schema:url": documentUrl,
				"schema:associatedMedia": [fileUri, metaUri, textUri],
				encodedBy: [
					{
						"@id": fileUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": [fileUrlIPFS, fileUrlS3],
						"schema:contentSize": fileSize,
						"schema:encodingFormat": contentType,
						"schema:name": fileName,
						"schema:mainEntityOfPage": { "@id": documentUri },
						"schema:uploadDate": eventTime,
					},
					{
						"@id": textUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": textUrlIPFS,
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
