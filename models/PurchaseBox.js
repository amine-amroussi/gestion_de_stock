module.exports = (sequelize, DataTypes) => {
  const PurchaseBox = sequelize.define('PurchaseBox', {
    purchase_id: { type: DataTypes.INTEGER, primaryKey: true },
    // product_id: { type: DataTypes.INTEGER, primaryKey: true },
    qttIn: { type: DataTypes.SMALLINT },
    qttOut: { type: DataTypes.SMALLINT },
    supplier: { type: DataTypes.INTEGER, allowNull: false }
  }, { tableName: 'PurchaseBox', timestamps: false });

  PurchaseBox.associate = (models) => {
    PurchaseBox.belongsTo(models.Purchase, { foreignKey: 'purchase_id', targetKey: 'id', as: 'PurchaseAssociation' });
    PurchaseBox.belongsTo(models.Box, { foreignKey: 'box', targetKey: 'id', as: 'BoxAssociation' });
    PurchaseBox.belongsTo(models.Supplier, { foreignKey: 'supplier', targetKey: 'id', as: 'SupplierAssociation' });
    PurchaseBox.belongsTo(models.Product, { foreignKey: 'product', targetKey: 'id', as: 'ProductAssociation' });
  };

  return PurchaseBox;
};