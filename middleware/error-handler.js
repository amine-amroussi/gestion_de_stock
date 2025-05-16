const { StatusCodes } = require("http-status-codes");

const errorHandlerMiddleware = (err, req, res, next) => {
  console.log(`This is An Error `, err);

  let customError = {
    statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    msg: err.message || "Something went wrong, please try again later",
  };

  // Handle Sequelize validation errors
  if (err.name === "SequelizeValidationError") {
    customError.msg = err.errors.map((error) => error.message).join(", ");
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Handle Sequelize unique constraint errors
  if (err.name === "SequelizeUniqueConstraintError") {
    customError.msg = `Duplicate value entered for ${err.errors
      .map((error) => error.path)
      .join(", ")}, please choose another value`;
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Handle Sequelize foreign key constraint errors
  if (err.name === "SequelizeForeignKeyConstraintError") {
    customError.msg =
      "Invalid reference: The provided foreign key does not exist.";
    customError.statusCode = StatusCodes.BAD_REQUEST;
  }

  // Handle Sequelize database connection errors
  if (err.name === "SequelizeConnectionError") {
    customError.msg =
      "Unable to connect to the database. Please try again later.";
    customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  }

  // Handle Sequelize record not found errors
  if (err.name === "SequelizeEmptyResultError") {
    customError.msg = "No record found with the provided criteria.";
    customError.statusCode = StatusCodes.NOT_FOUND;
  }

  // Handle generic Sequelize errors
  if (err.name === "SequelizeDatabaseError") {
    customError.msg = "A database error occurred. Please try again later.";
    customError.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  }

  return res.status(customError.statusCode).json({ msg: customError.msg });
};

module.exports = errorHandlerMiddleware;
