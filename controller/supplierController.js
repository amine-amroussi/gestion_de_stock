const CustomError = require("../errors");
const { StatusCodes } = require("http-status-codes");
const db = require("../models");

const createSupplier = async (req, res) => {
  const { name, tel, address } = req.body;
  if (!name || !tel || !address) {
    throw new CustomError.BadRequestError("Veuillez fournir toutes les valeurs requises.");
  }

  const supplier = await db.Supplier.create({
    name,
    tel,
    address,
  });

  res.status(StatusCodes.CREATED).json({ supplier });
};

const getAllSuppliers = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const { count, rows: suppliers } = await db.Supplier.findAndCountAll({
    attributes: ['id', 'name', 'address', 'tel'],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  const totalPages = Math.ceil(count / limit);

  res.status(StatusCodes.OK).json({
    status: 'success',
    data: {
      suppliers,
      pagination: {
        totalItems: count,
        totalPages,
        currentPage: parseInt(page),
        pageSize: parseInt(limit),
      },
    },
  });
};

const getSupplierById = async (req, res) => {
  const { id: supplierId } = req.params;
  const supplier = await db.Supplier.findOne({
    where: { id: supplierId },
    attributes: ["id", "name", "address", "tel"],
  });

  if (!supplier) {
    throw new CustomError.NotFoundError(`Aucun fournisseur avec l'identifiant : ${supplierId}`);
  }
  res.status(StatusCodes.OK).json({ supplier });
};

const updateSupplier = async (req, res) => {
  const { id: supplierId } = req.params;
  const { name, tel, address } = req.body;    
  if (!name || !tel || !address) {
    throw new CustomError.BadRequestError("Veuillez fournir toutes les valeurs requises.");
  }
  const supplier = await db.Supplier.findOne({
    where: { id: supplierId },
  });
  if (!supplier) {
    throw new CustomError.NotFoundError(`Aucun fournisseur avec l'identifiant : ${supplierId}`);
  }
  await db.Supplier.update(
    { name, tel, address },
    {
      where: { id: supplierId },
    }
  );
  const updatedSupplier = await db.Supplier.findOne({
    where: { id: supplierId },
    attributes: ["id", "name", "address", "tel"],
  });
  if (!updatedSupplier) {
    throw new CustomError.NotFoundError(`Aucun fournisseur avec l'identifiant : ${supplierId}`);
  }
  res.status(StatusCodes.OK).json({ updatedSupplier });
};

const deleteSupplier = async (req, res) => {
  const { id: supplierId } = req.params;

  const supplier = await db.Supplier.findOne({
    where: { id: supplierId },
  });

  if (!supplier) {
    throw new CustomError.NotFoundError(`Aucun fournisseur avec l'identifiant : ${supplierId}`);
  }

  try {
    await supplier.destroy();
    res.status(StatusCodes.OK).json({ msg: "Fournisseur supprimé avec succès." });
  } catch (error) {
    if (error.name === "SequelizeForeignKeyConstraintError") {
      throw new CustomError.BadRequestError(
        "Impossible de supprimer le fournisseur : il est lié à des commandes ou autres entités."
      );
    }
    throw new CustomError.InternalServerError("Erreur lors de la suppression du fournisseur.");
  }
};

module.exports = {
  createSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
};