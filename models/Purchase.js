module.exports = (sequelize, DataTypes) => {
  const Purchase = sequelize.define('Purchase', {
    id: { 
      type: DataTypes.INTEGER, 
      primaryKey: true,
      autoIncrement: true 
    },
    purchase: { type: DataTypes.STRING(100), allowNull: true }, // Kept as a field but not PK
    supplier: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATE },
    total: { type: DataTypes.DECIMAL(10, 2) }
  }, { tableName: 'Purchase', timestamps: false });

  Purchase.associate = (models) => {
    Purchase.belongsTo(models.Supplier, { foreignKey: 'supplier', targetKey: 'id', as: 'SupplierAssociation' });
    Purchase.hasMany(models.PurchaseProduct, { foreignKey: 'purchase_id', sourceKey: 'id', as: 'ProductAssociation' });
    Purchase.hasMany(models.PurchaseBox, { foreignKey: 'purchase_id', sourceKey: 'id', as: 'BoxAssociation' });
    Purchase.hasMany(models.PurchaseWaste, { foreignKey: 'purchase_id', sourceKey: 'id' });
  };

  return Purchase;
};