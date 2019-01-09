if (process.env.NODE_ENV !== "production") {
	require("./config.js")
}

const Sequelize = require("sequelize")

const operatorsAliases = {
	$or: Sequelize.Op.or,
	$and: Sequelize.Op.and,
	$ilike: Sequelize.Op.iLike,
	$in: Sequelize.Op.in,
	$not: Sequelize.Op.not,
	$eq: Sequelize.Op.eq,
	$ne: Sequelize.Op.ne,
	$lt: Sequelize.Op.lt,
	$gt: Sequelize.Op.gt,
}

const useSSL = process.env.DATABASE_URL.indexOf("localhost:") === -1
const sequelize = new Sequelize(process.env.DATABASE_URL, {
	logging: false,
	dialectOptions: { ssl: useSSL },
	operatorsAliases: operatorsAliases,
})

const Organization = sequelize.model("Organization")
const Document = sequelize.model("Document")
const Assertion = sequelize.model("Assertion")

module.exports = { sequelize, Organization, Document, Assertion }
