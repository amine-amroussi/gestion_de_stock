const router = require("express").Router();

const {
  createTruck,
  getAllTrucks,
  getTruckById,
  updateTruck,
  deleteTruck,
} = require("../controller/TruckController");

router.route("/").post(createTruck).get(getAllTrucks);
router
  .route("/:id")
  .get(getTruckById)
  .patch(updateTruck)
  .delete(deleteTruck);

module.exports = router;