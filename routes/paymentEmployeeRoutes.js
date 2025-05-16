const router = require("express").Router();
const {
  createEmployePayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
} = require("../controller/paymentEmployeeController");

router.route("/").post(createEmployePayment).get(getAllPayments);
router.route("/:id").get(getPaymentById).patch(updatePayment);

module.exports = router;
