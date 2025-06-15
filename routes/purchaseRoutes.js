
const router = require("express").Router();
const { createPurchase, getAllPurchases, getPurchaseById, createBoxWastePurchase, sendToSupplier, getTotalPurchaseAmount } = require("../controller/purchaseController");

router.route("/").get(getAllPurchases).post(createPurchase);
router.route("/box-waste").post(createBoxWastePurchase);
router.get("/total-amount", getTotalPurchaseAmount);

router.route("/:id").get(getPurchaseById);
router.route("/:id/send-supplier").post(sendToSupplier);

module.exports = router;
