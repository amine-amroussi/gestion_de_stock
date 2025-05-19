module.exports = (sequelize, DataTypes) => {
  const PurchaseProduct = sequelize.define('PurchaseProduct', {
    purchase_id: { type: DataTypes.INTEGER, primaryKey: true },
    product: { type: DataTypes.INTEGER, primaryKey: true },
    qtt: { type: DataTypes.SMALLINT },
    qttUnite : { type: DataTypes.SMALLINT },
    price: { type: DataTypes.DECIMAL(10, 2) },
  }, { tableName: 'PurchaseProduct', timestamps: false });


  PurchaseProduct.associate = (models) => {
    PurchaseProduct.belongsTo(models.Purchase, { foreignKey: 'purchase_id', targetKey: 'id', as: 'PurchaseAssociation' });
    PurchaseProduct.belongsTo(models.Product, { foreignKey: 'product', targetKey: 'id', as: 'ProductAssociation' });
    PurchaseProduct.belongsTo(models.Supplier, { foreignKey: 'supplier', targetKey: 'id', as: 'SupplierAssociation' });
  };

  return PurchaseProduct;
};