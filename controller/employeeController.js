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
  // Extract pagination parameters from query string
  const page = parseInt(req.query.page) || 1; // Default to page 1
  const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page
  const offset = (page - 1) * limit; // Calculate offset

  // Fetch employees with pagination and include total count
  const { count, rows: employees } = await db.Employee.findAndCountAll({
    attributes: ["cin", "role", "name", "address", "tel", "salary_fix"],
    order: [["cin", "ASC"]], // Sort by CIN for consistency
    limit, // Number of records per page
    offset, // Starting point
  });

  if (!employees || employees.length === 0) {
    throw new CustumError.NotFoundError("No employees found");
  }

  // Calculate pagination metadata
  const totalPages = Math.ceil(count / limit);

  // Return paginated response
  res.status(StatusCodes.OK).json({
    status: "success",
    data: {
      employees,
      pagination: {
        totalItems: count,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    },
  });
};

const getEmployeeById = async (req, res) => {
  const { id: employeeId } = req.params;
  const employee = await db.Employee.findOne({
    where: { cin: employeeId },
    attributes: ["cin", "role", "name", "address", "tel", "salary_fix"],
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
