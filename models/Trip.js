module.exports = (sequelize, DataTypes) => {
  const Trip = sequelize.define('Trip', {
    id: { 
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true 
    },
    truck_matricule: { type: DataTypes.STRING(50), allowNull: false }, // Changed from truck_id to truck_matricule
    driver_id: { type: DataTypes.STRING(100), allowNull: false },
    seller_id: { type: DataTypes.STRING(100), allowNull: false },
    assistant_id: { type: DataTypes.STRING(100), allowNull: true },
    date: { type: DataTypes.DATE },
    zone: { type: DataTypes.STRING(100) },
    waitedAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    receivedAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    benefit: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    deff : { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { tableName: 'Trip', timestamps: false });

  Trip.associate = (models) => {
    Trip.hasMany(models.TripProduct, { foreignKey: 'trip', sourceKey: 'id' });
    Trip.hasMany(models.TripWaste, { foreignKey: 'trip', sourceKey: 'id' });
    Trip.hasMany(models.TripBox, { foreignKey: 'trip', sourceKey: 'id' });
    Trip.hasMany(models.TripCharges, { foreignKey: 'trip', sourceKey: 'id' });
    Trip.belongsTo(models.Truck, { foreignKey: 'truck_matricule', targetKey: 'matricule', as: 'TruckAssociation' });
    Trip.belongsTo(models.Employee, { foreignKey: 'driver_id', targetKey: 'cin', as: 'DriverAssociation' });
    Trip.belongsTo(models.Employee, { foreignKey: 'seller_id', targetKey: 'cin', as: 'SellerAssociation' });
    Trip.belongsTo(models.Employee, { foreignKey: 'assistant_id', targetKey: 'cin', as: 'AssistantAssociation' });
  };

  return Trip;
};