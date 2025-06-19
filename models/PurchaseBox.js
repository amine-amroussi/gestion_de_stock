module.exports = (sequelize, DataTypes) => {
  const PurchaseBox = sequelize.define('PurchaseBox', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false },
    box: { type: DataTypes.INTEGER, allowNull: false },
    product: { type: DataTypes.INTEGER, allowNull: true },
    qttIn: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    qttOut: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    supplier: { type: DataTypes.INTEGER, allowNull: false },
  }, { tableName: 'PurchaseBox', timestamps: false });

  PurchaseBox.associate = (models) => {
    PurchaseBox.belongsTo(models.Purchase, { foreignKey: 'purchase_id', targetKey: 'id', as: 'PurchaseAssociation' });
    PurchaseBox.belongsTo(models.Box, { foreignKey: 'box', targetKey: 'id', as: 'BoxAssociation' });
    PurchaseBox.belongsTo(models.Supplier, { foreignKey: 'supplier', targetKey: 'id', as: 'SupplierAssociation' });
    PurchaseBox.belongsTo(models.Product, { foreignKey: 'product', targetKey: 'id', as: 'ProductAssociation' });
  };

  return PurchaseBox;
};  