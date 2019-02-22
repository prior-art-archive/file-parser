const fs = require("fs")

const parse = require("parse-head")
const exiftool = require("node-exiftool")
const exiftoolBin = require("dist-exiftool")
const tmp = require("tmp")

module.exports = async function getMetadata(file, contentType) {
	const metadata = {}
	if (contentType === "text/html") {
		const tags = await parse(file)
		tags.forEach(tag => {
			if (tag.nodeName.toLowerCase() === "meta" && tag.name) {
				metadata[tag.name] = tag.content
			} else {
				metadata[tag.nodeName.toLowerCase()] = tag.innerText
			}
		})
	} else if (contentType === "application/pdf") {
		const tmpobj = tmp.fileSync()
		fs.writeFileSync(tmpobj.name, file)

		const ep = new exiftool.ExiftoolProcess(exiftoolBin)

		const { data } = await ep
			.open()
			.then(() => ep.readMetadata(tmpobj.name, ["-File:all"]))

		Object.assign(metadata, data[0])
	}

	return metadata
}
