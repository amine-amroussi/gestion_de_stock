const router = require("express").Router();
const { createPurchase, getAllPurchases, getPurchaseById, deletePurchase } = require("../controller/purchaseController");

router.route("/").get(getAllPurchases).post(createPurchase);
router.route("/:id").get(getPurchaseById)

module.exports = router;