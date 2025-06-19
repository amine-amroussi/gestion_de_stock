const { StatusCodes } = require("http-status-codes");
const CustomError = require("../errors");
const db = require("../models");

const createBox = async (req, res) => {
  const { designation , type} = req.body;
  if (!designation) {
    throw new CustomError.BadRequestError("Designation requise.");
  }
  const box = await db.Box.create({ designation , type });
  res.status(StatusCodes.CREATED).json({ status: "success", data: { box } });
};

const getAllBoxes = async (req, res) => {
  const boxes = await db.Box.findAll();
  res.status(StatusCodes.OK).json({ status: "success", data: { boxes } });
};

const getSingleBox = async (req, res) => {
  const { id } = req.params;
  const box = await db.Box.findOne({ where: { id } });
  if (!box) {
    throw new CustomError.NotFoundError(`Caisse ${id} introuvable.`);
  }
  res.status(StatusCodes.OK).json({ status: "success", data: { box } });
};

const updateBox = async (req, res) => {
  const { id } = req.params;
  const { designation } = req.body;
  const box = await db.Box.findOne({ where: { id } });
  if (!box) {
    throw new CustomError.NotFoundError(`Caisse ${id} introuvable.`);
  }
  await db.Box.update({ designation }, { where: { id } });
  res.status(StatusCodes.OK).json({ status: "success", data: { box: { id, designation } } });
};

const deleteBox = async (req, res) => {
  const { id } = req.params;
  const box = await db.Box.findOne({ where: { id } });
  if (!box) {
    throw new CustomError.NotFoundError(`Caisse ${id} introuvable.`);
  }
  await box.destroy();
  res.status(StatusCodes.OK).json({ status: "success", message: "Caisse supprimée." });
};

module.exports = {
  createBox,
  getAllBoxes,
  getSingleBox,
  updateBox,
  deleteBox,
};