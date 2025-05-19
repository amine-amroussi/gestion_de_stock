module.exports = (sequelize, DataTypes) => {
  const TripProduct = sequelize.define('TripProduct', {
    trip: { type: DataTypes.INTEGER, primaryKey: true },
    product: { type: DataTypes.INTEGER, primaryKey: true },
    qttOut: { type: DataTypes.SMALLINT },
    qttOutUnite : { type: DataTypes.SMALLINT },
    qttReutour: { type: DataTypes.SMALLINT },
    qttReutourUnite : { type: DataTypes.SMALLINT },
    qttVendu: { type: DataTypes.SMALLINT },
    commission: { type: DataTypes.FLOAT, defaultValue: 0.008 }
  }, { tableName: 'TripProduct', timestamps: false });


  TripProduct.associate = (models) => {
    TripProduct.belongsTo(models.Trip, { foreignKey: 'trip', targetKey: 'id', as: 'TripAssociation' });
    TripProduct.belongsTo(models.Product, { foreignKey: 'product', targetKey: 'id', as: 'ProductAssociation' });
  };

  return TripProduct;
};