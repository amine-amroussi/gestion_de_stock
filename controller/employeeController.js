const CustumError = require("../errors");
const { StatusCodes } = require("http-status-codes");

const db = require("../models");

const createEmployee = async (req, res) => {
  const { name, tel, cin, salary_fix } = req.body;

  if (!name || !cin || !tel || !salary_fix) {
    throw new CustumError.BadRequestError("Please provide all values");
  }

  const employee = await db.Employee.create({
    ...req.body,
  });

  res.status(StatusCodes.CREATED).json({ employee });
};

const getAllEmployees = async (req, res) => {
  const employees = await db.Employee.findAll({
    attributes: ["cin", "type", "name", "address", "tel", "salary_fix"],
  });

  if (!employees) {
    throw new CustumError.NotFoundError("No employees found");
  }

  res.status(StatusCodes.OK).json({ employees });
};

const getEmployeeById = async (req, res) => {
  const { id: employeeId } = req.params;
  const employee = await db.Employee.findOne({
    where: { cin: employeeId },
    attributes: ["cin", "type", "name", "address", "tel", "salary_fix"],
  });
  if (!employee) {
    throw new CustumError.NotFoundError(`No employee with id : ${employeeId}`);
  }
  res.status(StatusCodes.OK).json({ employee });
};

const updateEmployee = async (req, res) => {
  const { id: employeeId } = req.params;
  const { name, tel, cin, salary_fix } = req.body;

  if (!name || !cin || !tel || !salary_fix) {
    throw new CustumError.BadRequestError("Please provide all values");
  }

  const employee = await db.Employee.findOne({
    where: { cin: employeeId },
  });

  if (!employee) {
    throw new CustumError.NotFoundError(`No employee with id : ${employeeId}`);
  }

  await db.Employee.update(
    { ...req.body },
    {
      where: { cin: employeeId },
    }
  );

  res.status(StatusCodes.OK).json({ msg: "Employee updated successfully" });
};

const deleteEmployee = async (req, res) => {
  res.send("Delete employee");
};

module.exports = {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
};
