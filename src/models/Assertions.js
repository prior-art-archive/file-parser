/* jshint indent: 1 */

module.exports = function(sequelize, DataTypes) {
	return sequelize.define('Assertions', {
		id: {
			type: DataTypes.UUIDV4,
			allowNull: false,
			primaryKey: true
		},
		documentId: {
			type: DataTypes.UUIDV4,
			allowNull: false
		},
		organizationId: {
			type: DataTypes.UUIDV4,
			allowNull: false
		},
		cid: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		createdAt: {
			type: DataTypes.DATE,
			allowNull: false
		},
		updatedAt: {
			type: DataTypes.DATE,
			allowNull: false
		},
		fileCid: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	}, {
		tableName: 'Assertions'
	});
};
