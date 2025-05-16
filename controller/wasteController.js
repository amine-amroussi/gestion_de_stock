const CustomError = require('../errors')
const db = require('../models')
const { StatusCodes } = require('http-status-codes')

const createWaste = async (req, res) => {
    // check if the waste is already in the database and increase just the quantity
    const { product, qtt, type } = req.body
    if (!product || !qtt || !type) {
        throw new CustomError.BadRequestError('Please provide all values')
    }
    const waste = await db.Waste.findOne({
        where: { product, type },
    })
    if (waste) {
        await waste.update({ qtt: waste.qtt + qtt })
        return res.status(StatusCodes.OK).json({ waste })
    }
    const newWaste = await db.Waste.create({
        product,
        qtt,
        type,
    })
    res.status(StatusCodes.CREATED).json({ newWaste })
}

const getAllWastes = async (req, res) => {
    const wastes = await db.Waste.findAll({})
    res.status(StatusCodes.OK).json({ wastes })
}

const getWasteById = async (req, res) => {
    const { id: wasteId } = req.params

    const waste = await db.Waste.findOne({
        where: { product: wasteId },
    })

    if (!waste) {
        throw new CustomError.NotFoundError(`Waste with ID ${wasteId} not found`)
    }

    res.status(StatusCodes.OK).json({ waste })
}


module.exports = {
    createWaste,
    getAllWastes,
    getWasteById,
}