const express = require("express");
const { getDefaultValues } = require("../controller/defaultValues");

const router = express.Router();

router.get("/", getDefaultValues);

module.exports = router;
