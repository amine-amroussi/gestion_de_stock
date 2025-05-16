module.exports = (sequelize, DataTypes) => {
  const Box = sequelize.define('Box', {
    id: { 
      type: DataTypes.INTEGER, 
      primaryKey: true,
      autoIncrement: true 
    },
    designation: { type: DataTypes.STRING(100), allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false },
    inStock: { type: DataTypes.SMALLINT, defaultValue: 0 },
    empty : { type: DataTypes.SMALLINT, defaultValue: 0 },
    sent : { type: DataTypes.SMALLINT, defaultValue: 0 },
    capacity: { type: DataTypes.INTEGER }
  }, { tableName: 'Box', timestamps: false });

  Box.associate = (models) => {
    Box.hasMany(models.Product, { foreignKey: 'box', sourceKey: 'id' });
    Box.hasMany(models.TripBox, { foreignKey: 'box', sourceKey: 'id' });
    Box.hasMany(models.PurchaseBox, { foreignKey: 'box', sourceKey: 'id' , as: 'BoxAssociation' });
  };

  return Box;
};