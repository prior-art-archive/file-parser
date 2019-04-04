const fs = require("fs")

const jsonld = require("jsonld")

const { HOSTNAME } = process.env

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
const getDocumentUrl = id => `https://www.${HOSTNAME}.org/doc/${id}`

const Text = value => ({ "@value": value, "@type": "schema:Text" })

// URIs should not use www subdomains and should not use https.
// (https://www.w3.org/TR/cooluris/ and https://www.w3.org/DesignIssues/Security-NotTheS.html, respectively)
// This is an identifier in a namespace, not a URL, and the actual URL
// will be included as a property of this URI in all assertions.
// If we ever get DOIs for our documents we should switch to those instead.
const getDocumentUri = id => `http://${HOSTNAME}/doc/${id}`

// see https://gist.github.com/joeltg/f066945ee780bfee769a26cea753f255 for background
const context = JSON.parse(fs.readFileSync("./tika-context.json"))
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
		rdfKeys.forEach(key => (rdf[key] = coerceRDFProperty(metadata[key])))
		return rdf
	} else {
		return null
	}
}

function coerceRDFProperty(value) {
	if (value === "true" || value === "false") {
		return value === "true"
	}

	if (!isNaN(value)) {
		return Number(value)
	}

	const milliseconds = Date.parse(value)
	if (!isNaN(milliseconds)) {
		const date = new Date(milliseconds)
		return {
			"@value": date.toISOString(),
			"@type": "http://www.w3.org/2001/XMLSchema#dateTime",
		}
	}

	return value
}

// "schemaProperties" are *known* values that correspond to columns
// in the Postgres database (right now only `title`.)
// We manually translate this into a schema.org property of the
// containing schema:DigitalDocument.
function getSchemaProperties(metadata, id) {
	if (metadata.hasOwnProperty("title")) {
		// No need for a context since we're only using the schema: prefix
		return {
			"@id": id,
			"schema:name": Text(metadata["title"]),
		}
	} else {
		return null
	}
}

module.exports = async function({
	eventTime,
	documentId,
	contentLength,
	contentType,
	generatedAtTime,
	fileUrl: fileUrlS3, // we'll also have a fileUrl from the IPFS gateway
	fileName,
	fileHash,
	textHash,
	textSize,
	metadata,
	metadataHash,
}) {
	const documentUri = getDocumentUri(documentId)
	const documentUrl = getDocumentUrl(documentId)
	const fileUri = `dweb:/ipfs/${fileHash}`
	const fileUrlIPFS = getGatewayUrl(fileHash)
	const fileSize = contentLength + "B"
	const metaUri = `dweb:/ipld/${metadataHash}`
	const textUri = `dweb:/ipfs/${textHash}`
	const textUrlIPFS = getGatewayUrl(textHash)

	// tikaAssertionGraph is the graph of properties that we will attribute to Tika
	const tikaGraph = []

	const rdfProperties = getRDFProperties(metadata, fileUri)
	if (rdfProperties !== null) {
		const rdfGraph = await jsonld.expand(rdfProperties)
		tikaGraph.push(rdfGraph)
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
		This is of type schema:DigitalDocument with a URI http://${HOSTNAME}/doc/<documentId>.
		This is *
	2. The File
	3. The Transcript
	4. The Metadata.
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
				"schema:transcript": { "@id": textUri },
				"schema:url": { "@type": "schema:URL", "@value": documentUrl },
				"schema:associatedMedia": [fileUri, metaUri, textUri],
				encodedBy: [
					{
						"@id": fileUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": [
							{ "@type": "schema:URL", "@value": fileUrlIPFS },
							{ "@type": "schema:URL", "@value": fileUrlS3 },
						],
						"schema:contentSize": Text(fileSize),
						"schema:encodingFormat": Text(contentType),
						"schema:name": Text(fileName),
						"schema:mainEntityOfPage": { "@id": documentUri },
						"schema:uploadDate": {
							"@value": eventTime,
							"@type": "schema:Date",
						},
					},
					{
						"@id": textUri,
						"@type": ["prov:Entity", "schema:MediaObject"],
						"schema:contentUrl": {
							"@type": "schema:URL",
							"@value": textUrlIPFS,
						},
						"schema:contentSize": Text(textSize),
						"schema:encodingFormat": Text("text/plain"),
						"prov:wasAttributedTo": { "@id": tikaSoftwareAgent },
						"prov:generatedAtTime": {
							"@value": generatedAtTime,
							"@type": "xsd:dateTime",
						},
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
