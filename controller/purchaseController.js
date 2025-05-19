const ErrorCustom = require("../errors");
const { StatusCodes } = require("http-status-codes");
const db = require("../models");

const createPurchase = async (req, res) => {
  // Destructure request body
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

  const purchase_id = newPurchase.id; // Correct variable name

  // Create purchase products
  const purchaseProductsPromises = purchaseProducts.map((product) => {
    return db.PurchaseProduct.create({
      purchase_id, // Correct variable name
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
      purchase_id, // Correct variable name
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
          purchase_id, // Correct variable name
          product: waste.product_id,
          qtt: waste.qtt,
          type: waste.type,
          supplier: supplier_id,
        });
      })
    : [];

  // Calculate the total
  let total = 0;
  purchaseProductsPromises.forEach(async (product) => {
    const _product = await db.Product.findOne({
      where: { id: product.product },
    });
    total +=
      product.price * (_product.capacityByBox * product.qtt + product.qttUnite);
  });

  // Update the purchase total
  await db.Purchase.update(
    { total: total },
    { where: { id: purchase_id } }
  );

  // increase the stock of the products
  await Promise.all(
    purchaseProducts.map(async (product) => {
      const productId = product.product_id;
      const qtt = product.qtt;

      // Check if the product exists in the database
      const existingProduct = await db.Product.findOne({
        where: { id: productId },
      });
      if (!existingProduct) {
        throw new ErrorCustom.NotFoundError(
          `Product with ID ${productId} not found`
        );
      }

      // Update the stock
      await db.Product.update(
        {
          stock: existingProduct.stock + qtt,
          uniteInStock: existingProduct.uniteInStock + product.qttUnite,
          
        },
        { where: { id: productId } }
      );
    })
  );

  // increase the stock of the boxes
  await Promise.all(
    purchaseBoxes.map(async (box) => {
      const boxId = box.box;
      const qttIn = box.qttIn;
      const qttOut = box.qttOut;

      // Check if the box exists in the database
      const existingBox = await db.Box.findOne({
        where: { id: boxId },
      });
      if (!existingBox) {
        throw new ErrorCustom.NotFoundError(`Box with ID ${boxId} not found`);
      }

      // Update the stock
      await db.Box.update(
        { inStock: existingBox.inStock + qttIn - qttOut },
        { where: { id: boxId } }
      );
    })
  );

  // if there is wastes decrease the quantity from Waste tabel stock
  await Promise.all(
    purchaseWaste.map(async (waste) => {
      const wasteId = waste.product_id;
      const qtt = waste.quantity;

      // Check if the waste exists in the database
      const existingWaste = await db.Waste.findOne({
        where: { product: wasteId },
      });
      if (!existingWaste) {
        throw new ErrorCustom.NotFoundError(
          `Waste with ID ${wasteId} not found`
        );
      }

      // Update the stock
      await db.Waste.update(
        { qtt: existingWaste.qtt - qtt },
        { where: { product: wasteId } }
      );
    })
  );

  // Send the response
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
  const purchases = await db.Purchase.findAll({
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

  res.status(StatusCodes.OK).json({ purchases });
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

  res.status(StatusCodes.OK).json({ purchase });
};

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
};
