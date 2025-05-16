const router = require("express").Router();
const {
  startTrip,
  getAllTrips,
  getTripById,
  finishTrip,
  getRestInLastTruck,
  getTrips,
} = require("../controller/tripController");

// 2313A50
router.route("/").post(startTrip).get(getTrips)
router.route("/:id").patch(finishTrip).get(getTripById);
router.route("/lastTruck/:id").get(getRestInLastTruck);

module.exports = router;
