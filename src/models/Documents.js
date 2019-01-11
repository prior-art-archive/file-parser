/* jshint indent: 1 */

module.exports = function(sequelize, DataTypes) {
	return sequelize.define('Documents', {
		id: {
			type: DataTypes.UUIDV4,
			allowNull: false,
			primaryKey: true
		},
		title: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		description: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		fileUrl: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		fileName: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		organizationId: {
			type: DataTypes.UUIDV4,
			allowNull: false,
			references: {
				model: 'Organizations',
				key: 'id'
			}
		},
		createdAt: {
			type: DataTypes.DATE,
			allowNull: false
		},
		updatedAt: {
			type: DataTypes.DATE,
			allowNull: false
		}
	}, {
		tableName: 'Documents'
	});
};
