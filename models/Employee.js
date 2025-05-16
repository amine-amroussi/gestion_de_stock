module.exports = (sequelize, DataTypes) => {
  const Employee = sequelize.define('Employee', {
    cin: { 
      type: DataTypes.STRING(100), 
      primaryKey: true 
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    tel: { type: DataTypes.STRING(100), allowNull: false },
    address: { type: DataTypes.STRING(100), allowNull: false },
    salary_fix: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    role: { type: DataTypes.STRING(50), allowNull: false }
  }, { tableName: 'Employee', timestamps: false });

  Employee.associate = (models) => {
    Employee.hasMany(models.Trip, { foreignKey: 'driver_id', sourceKey: 'cin', as: 'DriverTrips' });
    Employee.hasMany(models.Trip, { foreignKey: 'assistant_id', sourceKey: 'cin', as: 'AssistantTrips' });
    Employee.hasMany(models.Trip, { foreignKey: 'seller_id', sourceKey: 'cin', as: 'SellerTrips' });
    Employee.hasMany(models.PaymentEmployee, { foreignKey: 'employee_cin', sourceKey: 'cin' });
  };

  return Employee;
};