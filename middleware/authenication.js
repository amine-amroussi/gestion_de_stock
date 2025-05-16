const { isTokenValid } = require("../utils");
const CustomError = require("../errors");

const authenticateUser = async (req, res, next) => {
  const token = req.signedCookies.token;

  if (!token) {
    throw new CustomError.UnAuthenticateError("Authentication invalid");
  }
  try {
    const { name, email, role, userId } = isTokenValid({ token });
    req.user = { name, email, role, userId };
    next();
  } catch (error) {
    console.log(error);
    throw new CustomError.UnAuthenticateError("Authentication invalid");
  }
};

const authorizePermissions = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new CustomError.UnAuthorizeError(
        "Unauthorized to access this route"
      );
    }
    next();
  };
};

module.exports = { authenticateUser, authorizePermissions };
