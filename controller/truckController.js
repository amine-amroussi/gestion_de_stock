const { StatusCodes } = require("http-status-codes");
const CustomError = require("../errors");
const db = require("../models");

// CREATE TRUCK
const createTruck = async (req, res) => {
  const { matricule, capacity } = req.body;

  if (!matricule || !capacity) {
    throw new CustomError("Please provide all values", 400);
  }

  const truck = await db.Truck.create({
    matricule,
    capacity,
  });

  res.status(StatusCodes.CREATED).json({ truck });
};

// GET ALL TRUCKS
const getAllTrucks = async (req, res) => {
  const trucks = await db.Truck.findAll({});

  res.status(StatusCodes.OK).json({ trucks });
};

// GET TRUCK BY ID
const getTruckById = async (req, res) => {
  const { id: truckId } = req.params;

  const truck = await db.Truck.findOne({
    where: { matricule: truckId },
  });

  if (!truck) {
    throw new CustomError.NotFoundError(`Truck with ID ${truckId} not found`);
  }

  res.status(StatusCodes.OK).json({ truck });
};

// UPDATE TRUCK
const updateTruck = async (req, res) => {
  const { id: truckId } = req.params;
  const { capacity } = req.body;

  if (!capacity) {
    throw new CustomError.BadRequestError("Please provide all values");
  }

  const truck = await db.Truck.findOne({
    where: { matricule: truckId },
  });

  if (!truck) {
    throw new CustomError.NotFoundError(`Truck with ID ${truckId} not found`);
  }

  await truck.update({ capacity });

  res.status(StatusCodes.OK).json({ truck });
};

// DELETE TRUCK
const deleteTruck = async (req, res) => {
  const { id: truckId } = req.params;

  const truck = await db.Truck.findOne({
    where: { matricule: truckId },
  });

  if (!truck) {
    throw new CustomError.NotFoundError(`Truck with ID ${truckId} not found`);
  }

  await truck.destroy();

  res.status(StatusCodes.OK).json({ msg: "Truck deleted successfully" });
};

module.exports = {
  createTruck,
  getAllTrucks,
  getTruckById,
  updateTruck,
  deleteTruck,
};
