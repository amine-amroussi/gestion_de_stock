const express = require("express");
const router = express.Router();
const {
  startTrip,
  finishTrip,
  getRestInLastTruck,
  getTrips,
  getActiveTrips,
  getTripById,
  generateInvoice,
} = require("../controller/tripController");

// Routes for trip management
router.get("/", getTrips); // Get all trips with pagination
router.get("/active", getActiveTrips); // Get active trips
router.get("/:tripId", getTripById); // Get a trip by ID
router.post("/start", startTrip); // Start a new trip
router.post("/finish/:id", finishTrip); // Finish a trip
router.get("/last/:id", getRestInLastTruck); // Get last trip for a truck
router.get("/invoice/:id", generateInvoice); // Generate invoice for a trip

module.exports = router;
