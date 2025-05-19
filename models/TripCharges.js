module.exports = (sequelize, DataTypes) => {
  const TripCharges = sequelize.define('TripCharges', {
    trip: { type: DataTypes.INTEGER, primaryKey: true },
    charge: { type: DataTypes.INTEGER, primaryKey: true },
    amount: { type: DataTypes.DECIMAL(10, 2) }
  }, { tableName: 'TripCharges', timestamps: false });

  TripCharges.associate = (models) => {
    TripCharges.belongsTo(models.Trip, { foreignKey: 'trip', targetKey: 'id', as: 'TripAssociation' });
    TripCharges.belongsTo(models.Charge, { foreignKey: 'charge', targetKey: 'id', as: 'ChargeAssociation' });
  };

  return TripCharges;
};