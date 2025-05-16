const CustomError = require("../errors");
const { StatusCodes } = require("http-status-codes");
const db = require("../models");
const { json } = require("sequelize");

const createEmployePayment = async (req, res) => {
  const { status, month, year, employeeId } = req.body;

  const employee = await db.Employee.findOne({
    where: { cin: employeeId },
  });

  if (!employee) {
    throw new CustomError.NotFoundError(`No employee with id : ${employeeId}`);
  }

  // check if already has a payment in this month and year
  const paymentExist = await db.PaymentEmployee.findOne({
    where: { employee_cin: employeeId, month, year },
  });

  if (paymentExist) {
    throw new CustomError.BadRequestError("The Payment already exist");
  }

  // get all trip of the employee in the current moth
  const tripsEmployee = await db.Trip.findAll({
    where: {
      seller_id: employeeId,
      date: {
        [db.Sequelize.Op.between]: [
          new Date(year, month - 1, 1),
          new Date(year, month, 1),
        ],
      },
    },
  });

  // calculat credit and net_pay
  let credit = 0;

  tripsEmployee.forEach((trip) => {
    
    credit += parseFloat(trip.receivedAmount) - parseFloat(trip.waitedAmount);
  });

  let net_pay = parseFloat(employee.salary_fix) + credit;

  const paymentEmployeeData = await db.PaymentEmployee.create({
    employee_cin: employeeId,
    month,
    year,
    total: employee.salary_fix,
    credit,
    net_pay,
    status: status.status,
  });

  res
    .status(StatusCodes.OK)
    .json({ msg: "payment updated successfully", paymentEmployeeData });
};

const getAllPayments = async (req, res) => {
  const payments = await db.PaymentEmployee.findAll();
  res.status(StatusCodes.OK).json({ payments });
};

const getPaymentById = async (req, res) => {
  const { id: paymentId } = req.params;

  const payment = await db.PaymentEmployee.findOne({
    where: { payment_id: paymentId },
  });

  if (!payment) {
    throw new CustomError.NotFoundError(`No payment with id : ${paymentId}`);
  }

  res.status(StatusCodes.OK).json({ payment });
};

const updatePayment = async (req, res) => {
  const { id: paymentId } = req.params;
  const payment = await db.PaymentEmployee.update(
    { status: req.body.status },
    {
      where: { payment_id: paymentId },
    }
  );
  res.status(StatusCodes.OK).json({ payment });
};

module.exports = {
  createEmployePayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
};
