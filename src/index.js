const express = require("express")
const AWS = require("aws-sdk")

const validate = require("./validate.js")
const processFile = require("./process")

AWS.config.update({ region: process.env.AWS_REGION })
const s3 = new AWS.S3({ apiVersion: "2006-03-01" })

function processRecord({ eventTime, s3: { bucket, object } }) {
	const { name: Bucket } = bucket
	const { key: Key } = object
	return new Promise((resolve, reject) =>
		s3.getObject({ Bucket, Key }, (err, data) => {
			if (err !== null) reject(err)
			else processFile(eventTime, Bucket, Key, data).then(resolve, reject)
		})
	)
}

function handler(req, res) {
	// Validate the request body
	if (!validate(req.body)) {
		res.statusCode = 400
		res.json({ error: "Request did not pass validation" })
		res.end("\n")
		return
	}

	Promise.all(req.body.Records.map(processRecord))
		.then(assertions => {
			console.log("successfully wrote assertions:", assertions)
			res.statusCode = 200
			res.json({ assertions })
			res.end("\n")
		})
		.catch(error => {
			console.error("encountered an error:", error)
			res.statusCode = 500
			res.json({ error })
			res.end("\n")
		})
}

const app = express()
app.use(express.json())
app.post("/new", handler)

app.listen(8080, err => {
	if (err) {
		console.error(err)
	} else {
		console.log("Listening on port 8080")
	}
})
