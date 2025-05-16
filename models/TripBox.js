module.exports = (sequelize, DataTypes) => {
  const TripBox = sequelize.define('TripBox', {
    trip: { type: DataTypes.INTEGER, primaryKey: true },
    box: { type: DataTypes.INTEGER, primaryKey: true },
    qttOut: { type: DataTypes.SMALLINT },
    qttIn: { type: DataTypes.SMALLINT },
  }, { tableName: 'TripBox', timestamps: false });

  TripBox.associate = (models) => {
    TripBox.belongsTo(models.Trip, { foreignKey: 'trip', targetKey: 'id', as: 'TripAssociation' });
    TripBox.belongsTo(models.Box, { foreignKey: 'box', targetKey: 'id', as: 'BoxAssociation' });
  };

  return TripBox;
};