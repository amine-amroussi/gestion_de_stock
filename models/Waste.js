module.exports = (sequelize, DataTypes) => {
  const Waste = sequelize.define('Waste', {
    product: { type: DataTypes.INTEGER, primaryKey: true },
    type: { type: DataTypes.STRING(50), primaryKey: true },
    qtt: { type: DataTypes.INTEGER }
  }, { tableName: 'Waste', timestamps: false });

  Waste.associate = (models) => {
    Waste.belongsTo(models.Product, { foreignKey: 'product', targetKey: 'id', as: 'ProductAssociation' });
    Waste.hasMany(models.PurchaseWaste, { foreignKey: ['product', 'type'], sourceKey: 'product', constraints: false });
    Waste.hasMany(models.TripWaste, { foreignKey: ['product', 'type'], sourceKey: 'product', constraints: false });
  };

  return Waste;
};