const CustomError = require("../errors");

const checkPermission = (requestUser, resourceUserId) => {
  if (requestUser.role === "admin") return;
  if (requestUser.userId === resourceUserId.toString()) return;
  throw new CustomError.UnAuthorizeError(
    "Not authorized to access this route"
  );
};

module.exports = { checkPermission };
