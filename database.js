const Sequelize = require("sequelize")

const useSSL = process.env.DATABASE_URL.indexOf("localhost:") === -1
const sequelize = new Sequelize(process.env.DATABASE_URL, {
	logging: false,
	dialectOptions: { ssl: useSSL },
})

const Document = sequelize.import("./models/Documents.js")
const Assertion = sequelize.import("./models/Assertions.js")

module.exports = { Document, Assertion }
