/* jshint indent: 1 */

module.exports = function(sequelize, DataTypes) {
	return sequelize.define(
		"Organizations",
		{
			id: {
				type: DataTypes.UUIDV4,
				allowNull: false,
				primaryKey: true,
			},
			slug: {
				type: DataTypes.TEXT,
				allowNull: false,
				unique: true,
			},
			name: {
				type: DataTypes.TEXT,
				allowNull: false,
			},
			avatar: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			bio: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			email: {
				type: DataTypes.TEXT,
				allowNull: false,
				unique: true,
			},
			website: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			isAuthenticated: {
				type: DataTypes.BOOLEAN,
				allowNull: true,
			},
			resetHashExpiration: {
				type: DataTypes.DATE,
				allowNull: true,
			},
			resetHash: {
				type: DataTypes.TEXT,
				allowNull: true,
			},
			hash: {
				type: DataTypes.TEXT,
				allowNull: false,
			},
			salt: {
				type: DataTypes.TEXT,
				allowNull: false,
			},
			createdAt: {
				type: DataTypes.DATE,
				allowNull: false,
			},
			updatedAt: {
				type: DataTypes.DATE,
				allowNull: false,
			},
		},
		{
			tableName: "Organizations",
		}
	)
}
