const CustomError = require("../errors");
const { StatusCodes } = require("http-status-codes");
const db = require("../models");

const createEmployePayment = async (req, res) => {
  const { status, month, year, employeeId } = req.body;

  if (!status || !month || !year || !employeeId) {
    throw new CustomError.BadRequestError("Please provide all values (status, month, year, employeeId are required)");
  }

  if (!["Pending", "Paid", "Cancelled"].includes(status)) {
    throw new CustomError.BadRequestError("Status must be Pending, Paid, or Cancelled");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new CustomError.BadRequestError("Month must be an integer between 1 and 12");
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new CustomError.BadRequestError("Year must be an integer between 2000 and 2100");
  }

  const employee = await db.Employee.findOne({ where: { cin: employeeId } });
  if (!employee) {
    throw new CustomError.NotFoundError(`No employee with id: ${employeeId}`);
  }

  const paymentExist = await db.PaymentEmployee.findOne({ where: { employee_cin: employeeId, month, year } });
  if (paymentExist) {
    throw new CustomError.BadRequestError(`Payment for employee ${employeeId} in ${month}/${year} already exists`);
  }

  const tripsEmployee = await db.Trip.findAll({
    where: {
      seller_id: employeeId,
      date: {
        [db.Sequelize.Op.between]: [new Date(year, month - 1, 1), new Date(year, month, 0)],
      },
    },
  });

  let credit = 0;
  for (const trip of tripsEmployee) {
    const received = parseFloat(trip.receivedAmount) || 0;
    const waited = parseFloat(trip.waitedAmount) || 0;
    credit += received - waited;
  }

  // Calculer net_pay en soustrayant le credit du salaire de base
  const net_pay = parseFloat(employee.salary_fix) - parseFloat(credit.toFixed(2));

  const paymentEmployeeData = await db.PaymentEmployee.create({
    employee_cin: employeeId,
    month,
    year,
    total: parseFloat(employee.salary_fix),
    credit: parseFloat(credit.toFixed(2)),
    net_pay: parseFloat(net_pay.toFixed(2)),
    status,
  });

  res.status(StatusCodes.OK).json({ msg: "Payment created successfully", paymentEmployeeData });
};

const getAllPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    if (page < 1 || limit < 1) {
      throw new CustomError.BadRequestError("Page and limit must be positive integers");
    }

    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || "year";
    const sortOrder = req.query.sortOrder || "DESC";
    if (!["ASC", "DESC"].includes(sortOrder.toUpperCase())) {
      throw new CustomError.BadRequestError("sortOrder must be ASC or DESC");
    }
    const validSortFields = ["month", "year", "total", "credit", "net_pay"];
    if (sortBy && !validSortFields.includes(sortBy)) {
      throw new CustomError.BadRequestError(`sortBy must be one of ${validSortFields.join(", ")}`);
    }

    const status = req.query.status || "";
    const employeeId = req.query.employeeId || "";
    const search = req.query.search || "";

    const whereClause = {};
    if (status && ["Pending", "Paid", "Cancelled"].includes(status)) whereClause.status = status;
    if (employeeId) whereClause.employee_cin = employeeId;

    const employeeWhereClause = {};
    if (search) {
      employeeWhereClause[db.Sequelize.Op.or] = [
        { name: { [db.Sequelize.Op.like]: `%${search}%` } },
        { cin: { [db.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows: payments } = await db.PaymentEmployee.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.Employee,
          as: "EmployeeAssociation",
          attributes: ["cin", "name", "role"],
          where: employeeWhereClause,
          required: true,
        },
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset,
    });

    if (!payments || payments.length === 0) {
      return res.status(StatusCodes.OK).json({
        status: "success",
        data: { payments: [], pagination: { totalItems: 0, totalPages: 0, currentPage: page, pageSize: limit } },
      });
    }

    const totalPages = Math.ceil(count / limit);
    res.status(StatusCodes.OK).json({
      status: "success",
      data: { payments, pagination: { totalItems: count, totalPages, currentPage: page, pageSize: limit } },
    });
  } catch (error) {
    if (error instanceof CustomError) throw error;
    throw new CustomError.InternalServerError("Error fetching payments");
  }
};

const getPaymentsBetweenDates = async (req, res) => {
  try {
    const { employeeId, startMonth, startYear, endMonth, endYear } = req.query;

    if (!employeeId || !startMonth || !startYear || !endMonth || !endYear) {
      throw new CustomError.BadRequestError("employeeId, startMonth, startYear, endMonth, and endYear are required");
    }

    const startM = parseInt(startMonth);
    const startY = parseInt(startYear);
    const endM = parseInt(endMonth);
    const endY = parseInt(endYear);

    if (isNaN(startM) || startM < 1 || startM > 12) {
      throw new CustomError.BadRequestError("startMonth must be an integer between 1 and 12");
    }
    if (isNaN(startY) || startY < 2000 || startY > 2100) {
      throw new CustomError.BadRequestError("startYear must be an integer between 2000 and 2100");
    }
    if (isNaN(endM) || endM < 1 || endM > 12) {
      throw new CustomError.BadRequestError("endMonth must be an integer between 1 and 12");
    }
    if (isNaN(endY) || endY < 2000 || endY > 2100) {
      throw new CustomError.BadRequestError("endYear must be an integer between 2000 and 2100");
    }

    const startDate = new Date(startY, startM - 1);
    const endDate = new Date(endY, endM - 1);
    if (startDate > endDate) {
      throw new CustomError.BadRequestError("Start date must be before end date");
    }

    const whereClause = {
      employee_cin: employeeId,
      [db.Sequelize.Op.and]: [
        { year: { [db.Sequelize.Op.gte]: startY } },
        { year: { [db.Sequelize.Op.lte]: endY } },
        db.Sequelize.literal(`
          (year = ${startY} AND month >= ${startM})
          OR (year > ${startY} AND year < ${endY})
          OR (year = ${endY} AND month <= ${endM})
        `),
      ],
    };

    const payments = await db.PaymentEmployee.findAll({
      where: whereClause,
      include: [
        {
          model: db.Employee,
          as: "EmployeeAssociation",
          attributes: ["cin", "name", "role"],
        },
      ],
      order: [["year", "ASC"], ["month", "ASC"]],
    });

    if (!payments || payments.length === 0) {
      return res.status(StatusCodes.OK).json({
        status: "success",
        data: { payments: [], message: "No payments found for the given period" },
      });
    }

    res.status(StatusCodes.OK).json({
      status: "success",
      data: { payments },
    });
  } catch (error) {
    if (error instanceof CustomError) throw error;
    throw new CustomError.InternalServerError("Error fetching payments between dates");
  }
};

const getPaymentById = async (req, res) => {
  const { id: paymentId } = req.params;

  if (!paymentId || isNaN(paymentId)) {
    throw new CustomError.BadRequestError("Payment ID must be a valid number");
  }

  const payment = await db.PaymentEmployee.findOne({
    where: { payment_id: paymentId },
    include: [
      {
        model: db.Employee,
        as: "EmployeeAssociation",
        attributes: ["cin", "name", "role"],
      },
    ],
  });

  if (!payment) {
    throw new CustomError.NotFoundError(`No payment with id: ${paymentId}`);
  }

  res.status(StatusCodes.OK).json({ payment });
};

const updatePayment = async (req, res) => {
  const { id: paymentId } = req.params;
  const { status } = req.body;

  if (!paymentId || isNaN(paymentId)) {
    throw new CustomError.BadRequestError("Payment ID must be a valid number");
  }
  if (!status) {
    throw new CustomError.BadRequestError("Status is required");
  }
  if (!["Pending", "Paid", "Cancelled"].includes(status)) {
    throw new CustomError.BadRequestError("Status must be Pending, Paid, or Cancelled");
  }

  const payment = await db.PaymentEmployee.findOne({ where: { payment_id: paymentId } });
  if (!payment) {
    throw new CustomError.NotFoundError(`No payment with id: ${paymentId}`);
  }

  await db.PaymentEmployee.update({ status }, { where: { payment_id: paymentId } });
  res.status(StatusCodes.OK).json({ msg: "Payment status updated successfully" });
};

const getPaymentSummary = async (req, res) => {
  const { month, year } = req.query;

  if (month && (!Number.isInteger(parseInt(month)) || parseInt(month) < 1 || parseInt(month) > 12)) {
    throw new CustomError.BadRequestError("Month must be an integer between 1 and 12");
  }
  if (year && (!Number.isInteger(parseInt(year)) || parseInt(year) < 2000 || parseInt(year) > 2100)) {
    throw new CustomError.BadRequestError("Year must be an integer between 2000 and 2100");
  }

  const whereClause = {};
  if (month && year) {
    whereClause.month = parseInt(month);
    whereClause.year = parseInt(year);
  }

  const payments = await db.PaymentEmployee.findAll({
    where: whereClause,
    attributes: [
      [db.Sequelize.fn("COUNT", db.Sequelize.col("payment_id")), "totalPayments"],
      [db.Sequelize.fn("SUM", db.Sequelize.col("net_pay")), "totalNetPay"],
      [db.Sequelize.fn("SUM", db.Sequelize.col("credit")), "totalCredit"],
    ],
    raw: true,
  });

  const summary = {
    totalPayments: parseInt(payments[0]?.totalPayments) || 0,
    totalNetPay: parseFloat(payments[0]?.totalNetPay) || 0,
    totalCredit: parseFloat(payments[0]?.totalCredit) || 0,
  };

  res.status(StatusCodes.OK).json({ summary });
};

const getAllEmployees = async (req, res) => {
  try {
    const employees = await db.Employee.findAll({ attributes: ["cin", "name", "role"] });
    res.status(StatusCodes.OK).json({ employees });
  } catch (error) {
    throw new CustomError.InternalServerError("Error fetching employees");
  }
};

module.exports = {
  createEmployePayment,
  getAllPayments,
  getPaymentsBetweenDates,
  getPaymentById,
  updatePayment,
  getPaymentSummary,
  getAllEmployees,
};