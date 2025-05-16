module.exports = (sequelize, DataTypes) => {
  const TripWaste = sequelize.define('TripWaste', {
    trip: { type: DataTypes.INTEGER, primaryKey: true },
    product: { type: DataTypes.INTEGER, primaryKey: true },
    type: { type: DataTypes.STRING(50), primaryKey: true },
    qtt: { type: DataTypes.SMALLINT }
  }, { tableName: 'TripWaste', timestamps: false });

  TripWaste.associate = (models) => {
    TripWaste.belongsTo(models.Trip, { foreignKey: 'trip', targetKey: 'id', as: 'TripAssociation' });
    TripWaste.belongsTo(models.Waste, { 
      foreignKey: { name: 'product', field: 'product' }, 
      targetKey: 'product',
      foreignKey: { name: 'type', field: 'type' }, 
      targetKey: 'type',
      as: 'WasteAssociation',
      constraints: true
    });
  };

  return TripWaste;
};