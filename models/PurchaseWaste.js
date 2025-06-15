module.exports = (sequelize, DataTypes) => {
  const PurchaseWaste = sequelize.define(
    "PurchaseWaste",
    {
      purchase_id: { type: DataTypes.INTEGER, primaryKey: true }, // Changed to reference Purchase.id
      product: { type: DataTypes.INTEGER, primaryKey: true },
      type: { type: DataTypes.STRING(50), primaryKey: true },
      qtt: { type: DataTypes.SMALLINT },
      supplier: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: "PurchaseWaste", timestamps: false }
  );

  PurchaseWaste.associate = (models) => {
    PurchaseWaste.belongsTo(models.Purchase, {
      foreignKey: "purchase_id",
      targetKey: "id",
      as: "PurchaseAssociation",
    });
    PurchaseWaste.belongsTo(models.Product, {
      foreignKey: "product",
      as: "ProductAssociation",
      onDelete: "SET NULL", // Optional: Handle deletion gracefully
      onUpdate: "CASCADE",
    });
    PurchaseWaste.belongsTo(models.Supplier, {
      foreignKey: "supplier",
      targetKey: "id",
      as: "SupplierAssociation",
    });
  };

  return PurchaseWaste;
};
