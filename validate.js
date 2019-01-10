const AJV = require("ajv")

const { awsRegion, configurationId } = require("./constants")

const ajv = new AJV()

module.exports = ajv.compile({
	$schema: "http://json-schema.org/draft-07/schema#",
	type: "object",
	required: ["Records"],
	properties: {
		Records: {
			type: "array",
			items: {
				type: "object",
				required: ["eventName", "eventSource", "eventTime", "s3"],
				properties: {
					awsRegion: { const: awsRegion },
					eventName: { pattern: "^ObjectCreated:" },
					eventSource: { const: "aws:s3" },
					eventTime: { type: "string" },
					s3: {
						type: "object",
						required: ["bucket", "configurationId", "object"],
						properties: {
							bucket: {
								type: "object",
								required: ["name"],
								properties: {
									name: { type: "string" },
								},
							},
							configurationId: { const: configurationId },
							object: {
								type: "object",
								required: ["key", "size"],
								properties: {
									size: { type: "integer" },
									key: {
										type: "string",
										pattern: "uploads/[a-z0-9-]+/[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+",
									},
								},
							},
						},
					},
				},
			},
		},
	},
})
