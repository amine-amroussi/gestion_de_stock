const router = require("express").Router();
const {
  createEmployePayment,
  getAllPayments,
  getPaymentsBetweenDates,
  getPaymentById,
  updatePayment,
  getPaymentSummary,
  getAllEmployees,
} = require("../controller/paymentEmployeeController");

// Define static routes before dynamic routes
router.route("/between-dates").get(getPaymentsBetweenDates); // Moved before /:id
router.route("/summary").get(getPaymentSummary);
router.route("/employees").get(getAllEmployees);
router.route("/").post(createEmployePayment).get(getAllPayments);
router.route("/:id").get(getPaymentById).patch(updatePayment); // Dynamic route comes last

module.exports = router;