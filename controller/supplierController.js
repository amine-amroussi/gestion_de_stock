const CustumError = require("../errors");
const { StatusCodes } = require("http-status-codes");
const db = require("../models");

const createSupplier = async (req, res) => {
  const { name, tel, address } = req.body;
  if (!name || !tel || !address) {
    throw new CustumError.BadRequestError("Please provide all values");
  }

  const supplier = await db.Supplier.create({
    ...req.body,
  });

  res.status(StatusCodes.CREATED).json({ supplier });
};

const getAllSuppliers = async (req, res) => {
  const suppliers = await db.Supplier.findAll({
    attributes: ["id", "name", "address", "tel"],
  });
  if (!suppliers) {
    throw new CustumError.NotFoundError("No suppliers found");
  }
  res.status(StatusCodes.OK).json({ suppliers });
};

const getSupplierById = async (req, res) => {
    const { id: supplierId } = req.params;
    console.log(supplierId);
    
    const supplier = await db.Supplier.findOne({
      where: { id: supplierId },
      attributes: ["id", "name", "address", "tel"],
    });

    console.log(supplier);
    
    if (!supplier) {
      throw new CustumError.NotFoundError(`No supplier with id : ${supplierId}`);
    }
    res.status(StatusCodes.OK).json({ supplier });
};

const updateSupplier = async (req, res) => {
    const { id: supplierId } = req.params;
    const { name, tel, address } = req.body;    
    if (!name || !tel || !address) {
      throw new CustumError.BadRequestError("Please provide all values");
    }
    const supplier = await db.Supplier.findOne({
      where: { id: supplierId },
    });
    if (!supplier) {
      throw new CustumError.NotFoundError(`No supplier with id : ${supplierId}`);
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
      throw new CustumError.NotFoundError(`No supplier with id : ${supplierId}`);
    }
    res.status(StatusCodes.OK).json({ updatedSupplier });
};

module.exports = {
  createSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
};
