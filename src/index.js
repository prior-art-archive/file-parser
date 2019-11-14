const express = require("express")
const AWS = require("aws-sdk")

const validate = require("./validate")
const processFile = require("./process")

const { AWS_REGION } = process.env

AWS.config.update({ region: AWS_REGION })
const s3 = new AWS.S3({ apiVersion: "2006-03-01" })

function processRecord({ eventTime, s3: { bucket, object } }) {
	const { name: Bucket } = bucket
	const { key: Key } = object
	return new Promise((resolve, reject) =>
		s3.getObject({ Bucket, Key }, (err, data) => {
			if (err !== null) reject(err)
			else
				processFile(eventTime, Bucket, Key, data)
					.catch(reject)
					.then(resolve)
		})
	)
}

const app = express()
app.use(express.json())

app.post("/new", (req, res) => {
	console.log("New file / request")
	// Validate the request body
	if (!validate(req.body)) {
		console.error("AJV validation error")
		return res.status(400).json({ error: "Request did not pass validation" })
	}

	Promise.all(req.body.Records.map(processRecord))
		.catch(error => {
			console.error("encountered an error:", error)
			res.status(500).json({ error })
		})
		.then(assertions => {
			if (assertions !== undefined) {
				console.log("successfully wrote assertions:", assertions)
				res.status(200).json({ assertions })
			} else {
				console.log("Processing returned no assertions.")
			}
		})
})

app.listen(8080, err => {
	if (err) {
		console.error(err)
	} else {
		console.log("Listening on port 8080")
	}
})
