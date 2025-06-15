const express = require("express");
const {   getFinancialSummary } = require("../controller/revenueController");
const router = express.Router();

router.route("/").get(getFinancialSummary);

module.exports = router;
