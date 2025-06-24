const CustomError = require('../errors');
const db = require('../models');
const { StatusCodes } = require('http-status-codes');

const createWaste = async (req, res) => {
    const { product, qtt, type } = req.body;
    if (!product || !qtt || !type) {
        throw new CustomError.BadRequestError('Veuillez fournir tous les champs requis : produit, quantité et type');
    }
    const quantity = parseFloat(qtt); // Convert qtt to number
    if (isNaN(quantity) || quantity <= 0) {
        throw new CustomError.BadRequestError('La quantité doit être un nombre positif');
    }
    const waste = await db.Waste.findOne({
        where: { product, type },
    });
    if (waste) {
        const newQuantity = parseFloat(waste.qtt) + quantity; // Ensure numeric addition
        await waste.update({ qtt: newQuantity });
        return res.status(StatusCodes.OK).json({ waste });
    }
    const newWaste = await db.Waste.create({
        product,
        qtt: quantity,
        type,
    });
    res.status(StatusCodes.CREATED).json({ newWaste });
};

const getAllWastes = async (req, res) => {
    const { page = 1, limit = 10, type, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    // Build the where clause for filtering
    const where = {};
    if (type) {
        where.type = type;
    }
    if (startDate) {
        where.createdAt = { [db.Sequelize.Op.gte]: new Date(startDate) };
    }
    if (endDate) {
        where.createdAt = {
            ...where.createdAt,
            [db.Sequelize.Op.lte]: new Date(endDate),
        };
    }

    const { count, rows: wastes } = await db.Waste.findAndCountAll({
        where,
        offset,
        limit: parseInt(limit),
    });

    if (!wastes.length) {
        throw new CustomError.NotFoundError('Aucun déchet trouvé');
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
        throw new CustomError.NotFoundError(`Déchet avec l'ID ${wasteId} introuvable`);
    }

    res.status(StatusCodes.OK).json({ waste });
};

const getWastes = async (req, res) => {
    const waistes  = await db.Waste.findAll();
    res.status(StatusCodes.OK).json({ waistes });
};

const sendToSupplier = async (req, res) => {
  const { id } = req.params;
  const { boxes, wastes } = req.body;

  try {
    const purchase = await db.Purchase.findByPk(id, {
      include: [
        { model: db.Supplier, as: 'SupplierAssociation' },
        { model: db.PurchaseBox, as: 'BoxAssociation', include: [{ model: db.Box, as: 'BoxAssociation' }] },
        { model: db.PurchaseWaste, as: 'purchaseWaste', include: [{ model: db.Product, as: 'ProductAssociation' }] },
      ],
    });

    if (!purchase) {
      throw new CustomError.NotFoundError(`Achat avec l'ID ${id} introuvable`);
    }

    if (!boxes && !wastes) {
      throw new CustomError.BadRequestError('Aucune caisse ou déchet fourni');
    }

    // Validate boxes
    if (boxes) {
      for (const box of boxes) {
        const dbBox = purchase.BoxAssociation.find(b => b.box_id === box.box_id);
        if (!dbBox) {
          throw new CustomError.BadRequestError(`Caisse ID ${box.box_id} non trouvée dans l'achat`);
        }
        if (box.qttIn !== dbBox.qttIn || box.qttOut !== dbBox.qttOut) {
          throw new CustomError.BadRequestError(`Données de caisse ID ${box.box_id} non conformes`);
        }
      }
    }

    // Validate wastes
    if (wastes) {
      for (const waste of wastes) {
        const dbWaste = purchase.purchaseWaste.find(w => w.product_id === waste.product_id && w.type === waste.type);
        if (!dbWaste) {
          throw new CustomError.BadRequestError(`Déchet ${waste.product_id} (${waste.type}) non trouvé dans l'achat`);
        }
        if (waste.qtt !== dbWaste.qtt) {
          throw new CustomError.BadRequestError(`Quantité de déchet ${waste.product_id} non conforme`);
        }
      }
    }

    // Placeholder: Implement supplier notification (e.g., email, database log)
    console.log(`Sending to supplier for purchase ${id}:`, { boxes, wastes, supplier: purchase.SupplierAssociation });

    // Example: Log to a notification table (optional)
    await db.Notification.create({
      purchase_id: id,
      supplier_id: purchase.supplier_id,
      data: JSON.stringify({ boxes, wastes }),
      status: 'pending',
      created_at: new Date(),
    });

    res.status(StatusCodes.OK).json({ message: 'Données envoyées au fournisseur avec succès' });
  } catch (error) {
    console.error('sendToSupplier error:', error);
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};


module.exports = {
    createWaste,
    getAllWastes,
    getWasteById,
    getWastes,
    sendToSupplier
};