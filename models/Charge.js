module.exports = (sequelize, DataTypes) => {
  const Charge = sequelize.define('Charge', {
    id: { 
      type: DataTypes.INTEGER, 
      primaryKey: true,
      autoIncrement: true 
    },
    type: { type: DataTypes.STRING(100) },
    amount: { type: DataTypes.DECIMAL(10, 2) },
    date: { type: DataTypes.DATE }
  }, { tableName: 'Charge', timestamps: false });

  Charge.associate = (models) => {
    Charge.hasMany(models.TripCharges, { foreignKey: 'charge', sourceKey: 'id' });
  };

  return Charge;
};