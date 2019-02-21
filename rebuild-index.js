const IPFS = require("ipfs-http-client");
const elasticsearch = require("elasticsearch");
const Sequelize = require("sequelize");

const jsonld = require("jsonld");

const { IPFS_HOST, DATABASE_URL, ELASTIC_URL } = process.env;

const ipfs = IPFS({ host: IPFS_HOST, port: 443, protocol: "https" });

const elastic = new elasticsearch.Client({ host: ELASTIC_URL });

const sequelize = new Sequelize(DATABASE_URL, { logging: false, dialectOptions: { ssl: true } });

const Document = sequelize.import("./src/models/Documents.js");
const Assertion = sequelize.import("./src/models/Assertions.js");

/* Documents have many Assertions. Assertions belong to a single Document */
Document.hasMany(Assertion, { onDelete: 'CASCADE', as: 'assertions', foreignKey: 'documentId' });
Assertion.belongsTo(Document, { onDelete: 'CASCADE', as: 'document', foreignKey: 'documentId' });

const stepSize = 10;

const frame = {
	"@type": "http://schema.org/DigitalDocument",
	"http://schema.org/transcript": {},
	"http://schema.org/mainEntity": {}
};

const options = {
	explicit: true,
};

const dweb = /dweb:\/ipfs\/([a-zA-Z0-9]+)/;

async function page(offset) {
	const { count, rows } = await Document.findAndCountAll({
		offset,
		limit: stepSize,
		include: [ { model: Assertion, as: 'assertions' } ]
	});

	const docs = await Promise.all(rows.map(doc => {
		if (doc.assertions.length > 0) {
			const assertion = doc.assertions[0];
			const elasticSearch = {
				id: doc.id,
				title: doc.title,
				fileUrl: doc.fileUrl,
				organizationId: doc.organizationId,
				uploadDate: doc.createdAt,
				contentType: doc.contentType,
			};
			console.log(doc.id, assertion.cid)
			return ipfs.cat(assertion.cid)
				.then(file => jsonld.fromRDF(file.toString(), {format: 'application/n-quads'}))
				.then(doc => jsonld.frame(doc, frame, options))
				.then(doc => {
					if (Array.isArray(doc["@graph"]) && doc["@graph"].length > 0) {
						const [{
							["http://schema.org/transcript"]: {"@id": transcriptUri},
							["http://schema.org/mainEntity"]: {"@id": fileUri}
						}] = doc["@graph"];
						const [_, transcript] = dweb.exec(transcriptUri);
						// const [_, file] = dweb.exec(fileUri)
						return ipfs.cat(transcript);
					} else {
						return null;
					}
				})
				.then(transcript => {
					if (transcript) {
						return {
							...elasticSearch,
							text: transcript.toString()
						};
					}
				});
		} else {
			return null;
		}
	}));

	const body = docs.reduce((body, doc) => {
		if (doc) {
			body.push({ update: { _id: doc.id } });
			body.push({ doc });
		}
		return body;
	}, []);

	if (body.length > 0) {
		const { took, errors } = await elastic.bulk({ index: "documents", type: "doc", body });
		console.log({ took, errors });
	}
	
	return [count, rows.length];
}

async function iterate(start) {
	const [count, length] = await page(start);
	let offset = length + start
	while (offset < count) {
		console.log(`paging ${offset} out of ${count}`);
		const [_, length] = await page(offset);
		offset += length;
	}
}

iterate(0).catch(e => console.error(e))