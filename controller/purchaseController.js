const ErrorCustom = require("../errors");
const { StatusCodes } = require("http-status-codes");
const db = require("../models");

const createPurchase = async (req, res) => {
  const { purchaseProducts, purchaseBoxes, purchaseWaste, supplier_id, date } =
    req.body;

  // Validate inputs
  if (!purchaseProducts || !Array.isArray(purchaseProducts)) {
    throw new ErrorCustom.BadRequestError(
      "Please provide the purchase products in the request body"
    );
  }
  if (!purchaseBoxes || !Array.isArray(purchaseBoxes)) {
    throw new ErrorCustom.BadRequestError(
      "Please provide the purchase boxes in the request body"
    );
  }
  if (purchaseWaste && !Array.isArray(purchaseWaste)) {
    throw new ErrorCustom.BadRequestError("Purchase waste must be an array");
  }

  // Create the purchase
  const newPurchase = await db.Purchase.create({
    supplier_id,
    supplier: supplier_id,
    purchase: "1",
    date,
    total: 0,
  });

  const purchase_id = newPurchase.id;

  // Create purchase products
  const purchaseProductsPromises = purchaseProducts.map((product) => {
    return db.PurchaseProduct.create({
      purchase_id,
      product: product.product_id,
      qtt: product.qtt,
      qttUnite: product.qttUnite > 0 ? product.qttUnite : 0,
      price: product.price,
      supplier: supplier_id,
    });
  });

  // Create purchase boxes
  const purchaseBoxesPromises = purchaseBoxes.map((box) => {
    return db.PurchaseBox.create({
      purchase_id,
      box: box.box,
      qttIn: box.qttIn,
      qttOut: box.qttOut,
      supplier: supplier_id,
    });
  });

  // Create purchase waste (if provided)
  const purchaseWastePromises = purchaseWaste
    ? purchaseWaste.map((waste) => {
        return db.PurchaseWaste.create({
          purchase_id,
          product: waste.product_id,
          qtt: waste.qtt,
          type: waste.type,
          supplier: supplier_id,
        });
      })
    : [];

  // Calculate the total
  let total = 0;
  const resolvedProducts = await Promise.all(purchaseProductsPromises);
  for (const pd of resolvedProducts) {
    const _product = await db.Product.findOne({
      where: { id: pd.product },
    });
    total +=
      parseFloat(pd.price) *
      (parseFloat(_product.capacityByBox) * parseFloat(pd.qtt) +
        parseFloat(pd.qttUnite));
  }
  await db.Purchase.update({ total }, { where: { id: purchase_id } });

  // Update product stock
  await Promise.all(
    purchaseProducts.map(async (product) => {
      const productId = product.product_id;
      const qtt = product.qtt;

      const existingProduct = await db.Product.findOne({
        where: { id: productId },
      });
      if (!existingProduct) {
        throw new ErrorCustom.NotFoundError(
          `Product with ID ${productId} not found`
        );
      }

      await db.Product.update(
        {
          stock: existingProduct.stock + qtt,
          uniteInStock: existingProduct.uniteInStock + product.qttUnite,
        },
        { where: { id: productId } }
      );
    })
  );

  // Update box stock
  await Promise.all(
    purchaseBoxes.map(async (box) => {
      const boxId = box.box;
      const qttIn = box.qttIn;
      const qttOut = box.qttOut;

      const existingBox = await db.Box.findOne({
        where: { id: boxId },
      });
      if (!existingBox) {
        throw new ErrorCustom.NotFoundError(`Box with ID ${boxId} not found`);
      }

      await db.Box.update(
        { inStock: existingBox.inStock + qttIn - qttOut },
        { where: { id: boxId } }
      );
    })
  );

  // Update waste stock
  if (purchaseWaste && purchaseWaste.length > 0) {
    await Promise.all(
      purchaseWaste.map(async (waste) => {
        const wasteId = waste.product_id;
        const quantity = parseFloat(waste.qtt); // Ensure qtt is a number
        if (isNaN(quantity) || quantity <= 0) {
          throw new ErrorCustom.BadRequestError(
            `La quantité de déchet pour le produit ${wasteId} doit être positive`
          );
        }
        const existingWaste = await db.Waste.findOne({
          where: { product: wasteId },
        });
        if (!existingWaste) {
          throw new ErrorCustom.NotFoundError(
            `Déchet avec l'ID ${wasteId} introuvable`
          );
        }
        await db.Waste.update(
          { qtt: parseFloat(existingWaste.qtt) - quantity }, // Ensure numeric subtraction
          { where: { product: wasteId } }
        );
      })
    );
  }

  res.status(StatusCodes.CREATED).json({
    purchase: {
      id: newPurchase.id,
      supplier_id,
      date,
      total,
    },
    purchaseProducts: await Promise.all(purchaseProductsPromises),
    purchaseBoxes: await Promise.all(purchaseBoxesPromises),
    purchaseWaste: await Promise.all(purchaseWastePromises),
  });
};

const getAllPurchases = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const { count, rows } = await db.Purchase.findAndCountAll({
    include: [
      {
        model: db.Supplier,
        as: "SupplierAssociation",
        attributes: ["id", "name"],
      },
      {
        model: db.PurchaseProduct,
        as: "ProductAssociation",
        include: [
          {
            model: db.Product,
            as: "ProductAssociation",
            attributes: ["id", "designation", "stock", "priceUnite"],
          },
        ],
      },
      {
        model: db.PurchaseBox,
        as: "BoxAssociation",
        include: [
          {
            model: db.Box,
            as: "BoxAssociation",
            attributes: ["id", "designation", "inStock", "empty"],
          },
        ],
      },
    ],
    offset,
    limit: parseInt(limit),
  });

  if (count === 0) {
    throw new ErrorCustom.NotFoundError("No purchases found");
  }

  const pagination = {
    totalItems: count,
    totalPages: Math.ceil(count / limit),
    currentPage: parseInt(page),
    pageSize: parseInt(limit),
  };

  res.status(StatusCodes.OK).json({
    status: "success",
    data: { purchases: rows, pagination },
  });
};

const getPurchaseById = async (req, res) => {
  const { id } = req.params;

  const purchase = await db.Purchase.findOne({
    where: { id },
    include: [
      {
        model: db.Supplier,
        as: "SupplierAssociation",
        attributes: ["id", "name"],
      },
      {
        model: db.PurchaseProduct,
        as: "ProductAssociation",
        include: [
          {
            model: db.Product,
            as: "ProductAssociation",
            attributes: ["id", "designation", "stock", "priceUnite"],
          },
        ],
      },
      {
        model: db.PurchaseBox,
        as: "BoxAssociation",
        include: [
          {
            model: db.Box,
            as: "BoxAssociation",
            attributes: ["id", "designation", "inStock", "empty"],
          },
        ],
      },
    ],
  });

  if (!purchase) {
    throw new ErrorCustom.NotFoundError(`Purchase with ID ${id} not found`);
  }

  res.status(StatusCodes.OK).json({ status: "success", data: { purchase } });
};

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
};
