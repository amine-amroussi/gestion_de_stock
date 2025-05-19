module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define(
    "Product",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      designation: { type: DataTypes.STRING(100), allowNull: false },
      genre: { type: DataTypes.STRING(100), allowNull: false },
      priceUnite: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      uniteInStock : { type: DataTypes.SMALLINT, defaultValue: 0 },
      commaission: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.008,
      },
      stock: { type: DataTypes.SMALLINT, defaultValue: 0 },
      capacityByBox : { type: DataTypes.SMALLINT, defaultValue: 0 },
      box: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    { tableName: "Product", timestamps: false }
  );

  Product.associate = (models) => {
    Product.hasMany(models.TripProduct, {
      foreignKey: "product",
      sourceKey: "id",
    });
    Product.hasMany(models.Waste, { foreignKey: "product", sourceKey: "id" });
    Product.hasMany(models.PurchaseProduct, {
      foreignKey: "product",
      sourceKey: "id",
    });
    Product.belongsTo(models.Box, {
      foreignKey: "box",
      targetKey: "id",
      as: "BoxAssociation",
    });
  };

  return Product;
};
