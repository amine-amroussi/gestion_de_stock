const CustomError = require('../errors');
const db = require('../models');
const { StatusCodes } = require('http-status-codes');

const createWaste = async (req, res) => {
    const { product, qtt, type } = req.body;
    if (!product || !qtt || !type) {
        throw new CustomError.BadRequestError('Please provide all values');
    }
    const waste = await db.Waste.findOne({
        where: { product, type },
    });
    if (waste) {
        await waste.update({ qtt: waste.qtt + qtt });
        return res.status(StatusCodes.OK).json({ waste });
    }
    const newWaste = await db.Waste.create({
        product,
        qtt,
        type,
    });
    res.status(StatusCodes.CREATED).json({ newWaste });
};

const getAllWastes = async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: wastes } = await db.Waste.findAndCountAll({
        offset,
        limit: parseInt(limit),
    });

    if (!wastes.length) {
        throw new CustomError.NotFoundError('No wastes found');
    }

    res.status(StatusCodes.OK).json({
        wastes,
        pagination: {
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            pageSize: parseInt(limit),
        },
    });
};

const getWasteById = async (req, res) => {
    const { id: wasteId } = req.params;

    const waste = await db.Waste.findOne({
        where: { product: wasteId },
    });

    if (!waste) {
        throw new CustomError.NotFoundError(`Waste with ID ${wasteId} not found`);
    }

    res.status(StatusCodes.OK).json({ waste });
};

module.exports = {
    createWaste,
    getAllWastes,
    getWasteById,
};
