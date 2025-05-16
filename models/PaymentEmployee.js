module.exports = (sequelize, DataTypes) => {
  const PaymentEmployee = sequelize.define('PaymentEmployee', {
    payment_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_cin: { type: DataTypes.STRING(100), allowNull: false },
    month: { type: DataTypes.TINYINT, allowNull: false , primaryKey: true},
    year: { type: DataTypes.SMALLINT, allowNull: false, primaryKey: true},
    total: { type: DataTypes.DECIMAL(10, 2) },
    credit: { type: DataTypes.DECIMAL(16, 2) },
    net_pay: { type: DataTypes.DECIMAL(10, 2) },
    status: { type: DataTypes.STRING(50) }
  }, { tableName: 'PaymentEmployee', timestamps: false });

  PaymentEmployee.associate = (models) => {
    PaymentEmployee.belongsTo(models.Employee, { foreignKey: 'employee_cin', targetKey: 'cin', as: 'EmployeeAssociation' });
  };

  return PaymentEmployee;
};