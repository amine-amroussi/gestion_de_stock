module.exports = (sequelize, DataTypes) => {
  const Truck = sequelize.define('Truck', {
    matricule: { 
      type: DataTypes.STRING(50), 
      primaryKey: true,
      allowNull: false 
    },
    capacity: { type: DataTypes.INTEGER }
  }, { tableName: 'Truck', timestamps: false });

  Truck.associate = (models) => {
    Truck.hasMany(models.Trip, { foreignKey: 'truck_matricule', sourceKey: 'matricule' });
  };

  return Truck;
};