const db = require("../models");
const { StatusCodes } = require("http-status-codes");
const CustomError = require("../errors");

// Create a new box
const createBox = async (req, res) => {
  
  const box = await db.Box.create(req.body);
  res.status(StatusCodes.CREATED).json({
    box,
  });
};

// Get all boxes
const getAllBoxes = async (req, res) => {
  const boxes = await db.Box.findAll();
  res.status(StatusCodes.OK).json({
    boxes,
  });
};

// Get a single box
const getSingleBox = async (req, res) => {
  const { id: boxId } = req.params;
  const box = await db.Box.findOne({
    where: {
      id: boxId,
    },
  });
  res.status(StatusCodes.OK).json({
    box,
  });
};

// Update a box
const updateBox = async (req, res) => {
  const { id: boxId } = req.params;
  const box = await db.Box.update(req.body, {
    where: {
      id: boxId,
    },
  });
  res.status(StatusCodes.OK).json({
    box,
  });
};

// Delete a box
const deleteBox = async (req, res) => {
  const { id: boxId } = req.params;
  const box = await db.Box.findOne({
    where: {
      id: boxId,
    },
  })  

  if (!box) {
    throw new CustomError.NotFoundError("Box not found");
  }
  if (box.inStock !== 0 || box.empty !== 0 || box.sent !== 0) {
    console.log(box.inStock, box.empty, box.sent);
    
    throw new CustomError.BadRequestError("Box is not empty");
  }

  await db.Box.destroy({
    where: {
      id: boxId,
    },
  });
  res.status(StatusCodes.OK).json({
    msg: "Box deleted successfully",
  });
};

module.exports = {
  createBox,
  getAllBoxes,
  getSingleBox,
  updateBox,
  deleteBox,
};
