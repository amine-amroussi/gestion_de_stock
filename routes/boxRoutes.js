const express = require("express");
const router = express.Router();
const {
  createBox,
  getAllBoxes,
  getSingleBox,
  updateBox,
  deleteBox,
} = require("../controller/BoxController");

// Create a new box
router.route("/").post(createBox).get(getAllBoxes);
router.route("/:id").get(getSingleBox).patch(updateBox).delete(deleteBox);

module.exports = router;
