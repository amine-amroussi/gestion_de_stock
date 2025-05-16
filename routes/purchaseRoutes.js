const router = require("express").Router();
const {
  createPurchase,
  getAllPurchases,
  getPurchaseById
} = require("../controller/purchaseController");

router.route("/").post(createPurchase).get(getAllPurchases)
router.route("/:id").get(getPurchaseById);

module.exports = router;
