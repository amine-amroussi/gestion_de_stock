module.exports = (sequelize, DataTypes) => {
  const Supplier = sequelize.define('Supplier', {
    id: { 
      type: DataTypes.INTEGER, 
      primaryKey: true,
      autoIncrement: true 
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    tel: { type: DataTypes.STRING(50) },
    address: { type: DataTypes.STRING(255) }
  }, { tableName: 'Supplier', timestamps: false });

  Supplier.associate = (models) => {
    Supplier.hasMany(models.Purchase, { foreignKey: 'supplier', sourceKey: 'id' });
    Supplier.hasMany(models.PurchaseProduct, { foreignKey: 'supplier', sourceKey: 'id' });
    Supplier.hasMany(models.PurchaseBox, { foreignKey: 'supplier', sourceKey: 'id' });
    Supplier.hasMany(models.PurchaseWaste, { foreignKey: 'supplier', sourceKey: 'id' });
  };

  return Supplier;
};