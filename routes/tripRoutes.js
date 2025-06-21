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
  getAllProducts,
  getAllEmployees,
  emptyTruck,
  getTotalTripRevenue,
  getPreviousTrip,
} = require("../controller/tripController");

// Routes for trip management
router.get("/", getTrips); // Get all trips with pagination
router.get("/active", getActiveTrips); // Get active trips
router.get("/total-revenue", getTotalTripRevenue);
router.get("/:tripId", getTripById); // Get a trip by ID
router.get("/previous/:tripId", getPreviousTrip); // Get the previous trip for a trip ID
router.post("/start", startTrip); // Start a new trip
router.post("/finish/:id", finishTrip); // Finish a trip
router.get("/last/:id", getRestInLastTruck); // Get last trip for a truck
router.get("/invoice/:id", generateInvoice); // Generate invoice for a trip
router.get("/products/all", getAllProducts); // Get all products without pagination
router.get("/employees/all", getAllEmployees); // Get all employees without pagination
router.post("/empty/:matricule", emptyTruck); // Empty truck by matricule

module.exports = router;