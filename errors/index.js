const CustomAPIError = require("./custom-api");
const BadRequestError = require("./bad-request");
const NotFoundError = require("./not-found");
const UnAuthenticateError = require("./unauthenticate");
const UnAuthorizeError = require("./unauthorize");

module.exports = {
  CustomAPIError,
  BadRequestError,
  NotFoundError,
  UnAuthenticateError,
  UnAuthorizeError,
};
