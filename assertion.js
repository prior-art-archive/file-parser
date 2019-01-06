const jsonld = require("jsonld")

const JSONLD_OPTIONS = {
	algorithm: "URDNA2015",
	format: "application/n-quads",
}

// This is
const tikaReference =
	"dweb:/ipfs/QmV5MTXy3NccLFfqjzEGKdJQT3z1fd7WobRDakcZyCBkWz"

async function assembleAssertion(
	[fileUri, metaUri, textUri],
	[ContentType, ContentLength]
) {
	const assertion = {
		"@context": {
			xsd: "http://www.w3.org/2001/XMLSchema#",
			prov: "http://www.w3.org/ns/prov#",
			schema: "http://schema.org/",
			"prov:startedAtTime": { "@type": "xsd:dateTime" },
			"prov:endedAtTime": { "@type": "xsd:dateTime" },
			"schema:associatedMedia": { "@type": "@id" },
			"schema:encodesCreativeWork": { "@type": "@id" },
		},
		"@graph": [
			{
				"@id": "_:document",
				"@type": "schema:DigitalDocument",
				"schema:associatedMedia": [fileUri, metaUri, textUri],
			},
			{
				"@id": fileUri,
				"@type": "schema:MediaObject",
				"schema:encodingFormat": ContentType,
				"schema:contentSize": ContentLength + "B",
				"schema:encodesCreativeWork": "_:document",
			},
			{
				"@id": textUri,
				"@type": ["prov:Entity", "schema:MediaObject"],
				"schema:encodesCreativeWork": "_:document",
				"schema:contentUrl": "",
				"schema:contentSize": textSize + "B",
				"schema:encodingFormat": "text/plain",
				"prov:wasAttributedTo": { "@id": tikaReference + "#_:c14n72" },
				"prov:wasGeneratedBy": {
					"@id": "_:tikaActivity",
					"@type": "prov:Activity",
					"prov:generated": { "@id": textUri },
					"prov:used": { "@id": fileUri },
					"prov:startedAtTime": start.toISOString(),
					"prov:endedAtTime": textEnd.toISOString(),
					"prov:wasAssociatedWith": { "@id": tikaReference + "#_:c14n72" },
					"prov:qualifiedAssociation": {
						"@type": "prov:Association",
						"prov:agent": { "@id": tikaReference + "#_:c14n72" },
						"prov:hadRole": { "@id": tikaReference + "#_:c14n13" },
					},
				},
			},
			{
				"@id": metaUri,
				"@type": ["prov:Entity"],
				"prov:wasAttributedTo": { "@id": tikaReference + "#_:c14n72" },
				"prov:wasGeneratedBy": {
					"@id": "_:tikaActivity",
					"@type": "prov:Activity",
					"prov:generated": { "@id": metaUri },
					"prov:used": { "@id": fileUri },
					"prov:startedAtTime": start.toISOString(),
					"prov:endedAtTime": metaEnd.toISOString(),
					"prov:wasAssociatedWith": { "@id": tikaReference + "#_:c14n72" },
					"prov:qualifiedAssociation": {
						"@type": "prov:Association",
						"prov:agent": { "@id": tikaReference + "#_:c14n72" },
						"prov:hadRole": { "@id": tikaReference + "#_:c14n47" },
					},
				},
			},
		],
	}
	const canonized = await jsonld.canonize(assertion, JSONLD_OPTIONS)
	return canonized
}

module.exports = assembleAssertion
