const CustomError = require('../errors');
const db = require('../models');
const { StatusCodes } = require('http-status-codes');

const createCharge = async (req, res) => {
  const { type, amount, date } = req.body;
  if (!type || !amount || !date) {
    throw new CustomError.BadRequestError('Veuillez fournir tous les champs requis : type, montant et date');
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new CustomError.BadRequestError('Le montant doit être un nombre positif');
  }
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new CustomError.BadRequestError('La date fournie est invalide');
  }
  const existingCharge = await db.Charge.findOne({
    where: { type, date: parsedDate },
  });
  if (existingCharge) {
    throw new CustomError.BadRequestError('Une charge avec ce type et cette date existe déjà');
  }
  const newCharge = await db.Charge.create({
    type,
    amount: parsedAmount,
    date: parsedDate,
  });
  res.status(StatusCodes.CREATED).json({ newCharge });
};

const getAllCharges = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const { count, rows: charges } = await db.Charge.findAndCountAll({
    offset,
    limit: parseInt(limit),
  });

  if (!charges.length) {
    throw new CustomError.NotFoundError('Aucune charge trouvée');
  }

  res.status(StatusCodes.OK).json({
    charges,
    pagination: {
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
    },
  });
};

const getChargeById = async (req, res) => {
  const { id: chargeId } = req.params;

  const charge = await db.Charge.findByPk(chargeId);

  if (!charge) {
    throw new CustomError.NotFoundError(`Charge avec l'ID ${chargeId} introuvable`);
  }

  res.status(StatusCodes.OK).json({ charge });
};

const getCharges = async (req, res) => {
  const charges = await db.Charge.findAll();
  res.status(StatusCodes.OK).json({ charges });
};

const updateCharge = async (req, res) => {
  const { id } = req.params;
  const { type, amount, date } = req.body;

  const charge = await db.Charge.findByPk(id);
  if (!charge) {
    throw new CustomError.NotFoundError(`Charge avec l'ID ${id} introuvable`);
  }

  const updates = {};
  if (type) updates.type = type;
  if (amount) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new CustomError.BadRequestError('Le montant doit être un nombre positif');
    }
    updates.amount = parsedAmount;
  }
  if (date) {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new CustomError.BadRequestError('La date fournie est invalide');
    }
    updates.date = parsedDate;
  }

  if (Object.keys(updates).length === 0) {
    throw new CustomError.BadRequestError('Aucune donnée à mettre à jour fournie');
  }

  await charge.update(updates);
  res.status(StatusCodes.OK).json({ message: 'Charge mise à jour avec succès', charge });
};

module.exports = {
  createCharge,
  getAllCharges,
  getChargeById,
  getCharges,
  updateCharge,
};