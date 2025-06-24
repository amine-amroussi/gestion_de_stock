const CustomError = require('../errors');
const db = require('../models');
const { StatusCodes } = require('http-status-codes');
const { Op } = require('sequelize');

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
  const { page = 1, limit = 10, type, startDate, endDate } = req.query;
  const offset = (page - 1) * limit;
  const parsedLimit = parseInt(limit);

  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    throw new CustomError.BadRequestError('La limite doit être un nombre positif');
  }

  const where = {};
  if (type) {
    where.type = { [Op.like]: `%${type}%` }; // Changed to Op.like for MySQL
  }
  if (startDate) {
    const parsedStartDate = new Date(startDate);
    if (isNaN(parsedStartDate.getTime())) {
      throw new CustomError.BadRequestError('La date de début est invalide');
    }
    where.date = { [Op.gte]: parsedStartDate };
  }
  if (endDate) {
    const parsedEndDate = new Date(endDate);
    if (isNaN(parsedEndDate.getTime())) {
      throw new CustomError.BadRequestError('La date de fin est invalide');
    }
    where.date = { ...where.date, [Op.lte]: parsedEndDate };
  }

  try {
    const { count, rows: charges } = await db.Charge.findAndCountAll({
      where,
      offset,
      limit: parsedLimit,
      order: [['date', 'DESC']],
    });

    res.status(StatusCodes.OK).json({
      charges,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / parsedLimit),
        currentPage: parseInt(page),
        pageSize: parsedLimit,
      },
    });
  } catch (error) {
    console.error('Database error:', error);
    throw new CustomError.InternalServerError('Erreur lors de l\'accès à la base de données');
  }
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