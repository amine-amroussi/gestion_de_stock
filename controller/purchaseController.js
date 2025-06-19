const ErrorCustom = require("../errors");
const { StatusCodes } = require("http-status-codes");
const db = require("../models");
const { Op } = require("sequelize");

const createCommonPurchase = async (req, res, includeProducts = false) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { purchaseProducts, purchaseBoxes, purchaseWaste, supplier_id, date } = req.body;

    console.log("Received purchase request:", {
      supplier_id,
      date,
      purchaseProducts: includeProducts ? JSON.stringify(purchaseProducts, null, 2) : undefined,
      purchaseBoxes: JSON.stringify(purchaseBoxes, null, 2),
      purchaseWaste: JSON.stringify(purchaseWaste, null, 2),
    });

    // Input validations
    if (includeProducts) {
      if (!purchaseProducts || !Array.isArray(purchaseProducts)) {
        throw new ErrorCustom.BadRequestError("Please provide purchase products in the request body");
      }
      if (!purchaseProducts.length) {
        throw new ErrorCustom.BadRequestError("At least one purchase product is required");
      }
    }
    if (!purchaseBoxes || !Array.isArray(purchaseBoxes)) {
      throw new ErrorCustom.BadRequestError("Please provide purchase boxes in the request body");
    }
    if (!purchaseWaste || !Array.isArray(purchaseWaste)) {
      throw new ErrorCustom.BadRequestError("Please provide purchase waste in the request body");
    }
    if (!purchaseBoxes.length && !purchaseWaste.length && !includeProducts) {
      throw new ErrorCustom.BadRequestError("At least one box, waste, or product is required");
    }
    if (!supplier_id) {
      throw new ErrorCustom.BadRequestError("Supplier ID is required");
    }
    const supplier = await db.Supplier.findByPk(supplier_id, { transaction });
    if (!supplier) {
      throw new ErrorCustom.NotFoundError(`Supplier with ID ${supplier_id} not found`);
    }
    if (!date) {
      throw new ErrorCustom.BadRequestError("Date is required");
    }

    // Create Purchase
    const newPurchase = await db.Purchase.create(
      { supplier: supplier_id, date, total: 0 },
      { transaction }
    );
    const purchase_id = newPurchase.id;

    // Log all boxes before processing
    console.log("Processing purchaseBoxes:", purchaseBoxes);

    // Check for existing PurchaseBox records
    const existingPurchaseBox = await db.PurchaseBox.findOne({
      where: { purchase_id },
      transaction,
    });
    if (existingPurchaseBox) {
      throw new ErrorCustom.BadRequestError(`PurchaseBox record already exists for purchase_id ${purchase_id}`);
    }

    // Aggregate purchaseBoxes into a single record
    const aggregatedBox = purchaseBoxes.reduce(
      (acc, box) => {
        if (!box.box || box.qttIn < 0 || box.qttOut < 0) {
          throw new ErrorCustom.BadRequestError(
            `Invalid box data: box ID ${box.box}, qttIn and qttOut must be non-negative`
          );
        }
        return {
          box: acc.box || box.box,
          qttIn: acc.qttIn + (parseInt(box.qttIn) || 0),
          qttOut: acc.qttOut + (parseInt(box.qttOut) || 0),
        };
      },
      { box: null, qttIn: 0, qttOut: 0 }
    );

    console.log("Aggregated box:", aggregatedBox);

    // Validate aggregatedBox
    if (purchaseBoxes.length && !aggregatedBox.box) {
      throw new ErrorCustom.BadRequestError("No valid box ID found in purchaseBoxes");
    }

    // Create single PurchaseBox record if boxes exist
    if (purchaseBoxes.length) {
      await db.PurchaseBox.create(
        {
          purchase_id,
          box: aggregatedBox.box,
          product: purchaseBoxes[0]?.product || null,
          qttIn: aggregatedBox.qttIn,
          qttOut: aggregatedBox.qttOut,
          supplier: supplier_id,
        },
        { transaction }
      );
    }

    // Create PurchaseProduct records if applicable
    let total = 0;
    let resolvedProducts = [];
    if (includeProducts) {
      const purchaseProductsPromises = purchaseProducts.map((product) => {
        if (!product.product_id || product.qtt <= 0 || product.price <= 0) {
          throw new ErrorCustom.BadRequestError(
            `Invalid product data: product_id ${product.product_id}, qtt, and price must be positive`
          );
        }
        return db.PurchaseProduct.create(
          {
            purchase_id,
            product: product.product_id,
            qtt: product.qtt,
            qttUnite: product.qttUnite || 0,
            price: product.price,
          },
          { transaction }
        );
      });

      resolvedProducts = await Promise.all(purchaseProductsPromises);
      for (const pd of resolvedProducts) {
        const product = await db.Product.findOne({
          where: { id: pd.product },
          transaction,
        });
        if (!product) {
          throw new ErrorCustom.NotFoundError(`Product with ID ${pd.product} not found`);
        }
        total +=
          parseFloat(pd.price) *
          (parseFloat(product.capacityByBox || 0) * parseFloat(pd.qtt) +
            parseFloat(pd.qttUnite || 0));
      }
      await db.Purchase.update(
        { total },
        { where: { id: purchase_id }, transaction }
      );

      // Update product stock
      await Promise.all(
        purchaseProducts.map(async (product) => {
          const productId = product.product_id;
          const qtt = product.qtt;

          const existingProduct = await db.Product.findOne({
            where: { id: productId },
            transaction,
          });
          if (!existingProduct) {
            throw new ErrorCustom.NotFoundError(`Product with ID ${productId} not found`);
          }

          await db.Product.update(
            {
              stock: existingProduct.stock + qtt,
              uniteInStock: existingProduct.uniteInStock + (product.qttUnite || 0),
            },
            { where: { id: productId }, transaction }
          );
        })
      );
    }

    // Create PurchaseWaste records
    const purchaseWastePromises =
      purchaseWaste && purchaseWaste.length > 0
        ? purchaseWaste.map((waste) => {
            if (!waste.product_id || waste.qtt <= 0 || !waste.type) {
              throw new ErrorCustom.BadRequestError(
                `Invalid waste data: product_id ${waste.product_id}, qtt (positive), and type are required`
              );
            }
            return db.PurchaseWaste.create(
              {
                purchase_id,
                product: waste.product_id,
                type: waste.type,
                qtt: waste.qtt,
                supplier: supplier_id,
              },
              { transaction }
            );
          })
        : [];

    // Update box stock for each box
    const boxUpdates = await Promise.all(
      purchaseBoxes.map(async (box) => {
        const existingBox = await db.Box.findOne({
          where: { id: box.box },
          transaction,
        });
        if (!existingBox) {
          throw new ErrorCustom.NotFoundError(`Box with ID ${box.box} not found`);
        }

        const newEmpty = existingBox.empty - box.qttOut;
        if (newEmpty < 0) {
          throw new ErrorCustom.BadRequestError(
            `Cannot reduce empty boxes below 0 for box ID ${box.box} (current: ${existingBox.empty}, qttOut: ${box.qttOut})`
          );
        }

        await db.Box.update(
          {
            inStock: existingBox.inStock + box.qttIn,
            empty: newEmpty,
          },
          { where: { id: box.box }, transaction }
        );

        return { boxId: box.box, inStock: existingBox.inStock + box.qttIn, empty: newEmpty };
      })
    );

    console.log("Box stock updates:", boxUpdates);

    // Process waste
    if (purchaseWaste && purchaseWaste.length > 0) {
      await Promise.all(
        purchaseWaste.map(async (waste) => {
          const wasteId = waste.product_id;
          const quantity = parseFloat(waste.qtt);

          console.log(`Processing waste for product ${wasteId}:`, {
            quantity,
            type: waste.type,
          });

          if (isNaN(quantity) || quantity <= 0) {
            throw new ErrorCustom.BadRequestError(
              `Waste quantity for product ${wasteId} must be positive`
            );
          }

          let existingWaste = await db.Waste.findOne({
            where: { product: wasteId, type: waste.type },
            transaction,
          });
          if (!existingWaste) {
            console.log(`Creating new Waste record for product ${wasteId}, type ${waste.type}`);
            existingWaste = await db.Waste.create(
              {
                product: wasteId,
                type: waste.type,
                qtt: 0,
              },
              { transaction }
            );
          }

          const newWasteQtt = parseFloat(existingWaste.qtt) + quantity;
          console.log(`Updating waste stock for product ${wasteId}:`, {
            currentQtt: existingWaste.qtt,
            increaseBy: quantity,
            newQtt: newWasteQtt,
          });

          await db.Waste.update(
            { qtt: newWasteQtt },
            { where: { product: wasteId, type: waste.type }, transaction }
          );
        })
      );
    }

    await Promise.all(purchaseWastePromises);
    await transaction.commit();
    console.log("Purchase created successfully:", { purchase_id, total });

    return res.status(StatusCodes.CREATED).json({
      purchase: {
        id: newPurchase.id,
        supplier_id,
        date,
        total,
      },
      purchaseProducts: resolvedProducts,
      purchaseBoxes: purchaseBoxes,
      purchaseWaste: await Promise.all(purchaseWastePromises),
      message: purchaseBoxes.length > 1 ? "Multiple boxes aggregated into one PurchaseBox record." : undefined,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("createPurchase error:", {
      message: error.message,
      stack: error.stack,
      status: error.statusCode,
      requestBody: req.body,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    return res.status(status).json({ message: error.message });
  }
};

const createPurchase = async (req, res) => {
  return createCommonPurchase(req, res, true);
};

const createBoxWastePurchase = async (req, res) => {
  return createCommonPurchase(req, res, false);
};

const getAllPurchases = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    startDate,
    endDate,
    supplierId,
    minTotal,
    maxTotal,
    search,
  } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date[Op.gte] = startDate;
    if (endDate) where.date[Op.lte] = endDate;
  }
  if (supplierId) {
    where.supplier = parseInt(supplierId);
  }
  if (minTotal || maxTotal) {
    where.total = {};
    if (minTotal) where.total[Op.gte] = parseFloat(minTotal);
    if (maxTotal) where.total[Op.lte] = parseFloat(maxTotal);
  }

  const supplierWhere = {};
  if (search) {
    supplierWhere.name = { [Op.iLike]: `%${search}%` };
    where[Op.or] = [
      { id: { [Op.iLike]: `%${search}%` } },
      { "$Supplier.name$": { [Op.iLike]: `%${search}%` } },
    ];
  }

  try {
    const { count, rows } = await db.Purchase.findAndCountAll({
      where,
      include: [
        {
          model: db.Supplier,
          as: "Supplier",
          attributes: ["id", "name"],
          where: supplierWhere,
        },
        {
          model: db.PurchaseProduct,
          as: "PurchaseProducts",
          include: [
            {
              model: db.Product,
              as: "Product",
              attributes: ["id", "designation", "stock", "priceUnite"],
            },
          ],
        },
        {
          model: db.PurchaseBox,
          as: "PurchaseBoxes",
          include: [
            {
              model: db.Box,
              as: "Box",
              attributes: ["id", "designation", "inStock", "empty"],
            },
          ],
        },
        {
          model: db.PurchaseWaste,
          as: "PurchaseWastes",
          attributes: ["purchase_id", "product", "type", "qtt", "supplier"],
          include: [
            {
              model: db.Product,
              as: "Product",
              attributes: ["id", "designation"],
              required: false,
            },
          ],
        },
      ],
      offset,
      limit: parseInt(limit),
    });

    const WastesArray = rows.map((purchase) => ({
      purchaseId: purchase.id,
      details: purchase.PurchaseWastes.map((waste) => ({
        product_id: waste.product,
        designation: waste.Product?.designation || `Produit ${waste.product}`,
        qtt: waste.qtt,
        type: waste.type,
      })),
    }));

    const purchasesWithWastes = rows.map((purchase) => {
      const wasteData = WastesArray.find((w) => w.purchaseId === purchase.id);
      return {
        ...purchase.toJSON(),
        WastesArray: wasteData || { purchaseId: purchase.id, details: [] },
      };
    });

    const pagination = {
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
    };

    if (count === 0) {
      throw new ErrorCustom.NotFoundError("No purchases found");
    }

    console.log("WastesArray:", JSON.stringify(WastesArray, null, 2));

    res.status(StatusCodes.OK).json({
      status: "success",
      data: { purchases: purchasesWithWastes, pagination, WastesArray },
    });
  } catch (error) {
    console.error("getAllPurchases error:", {
      message: error.message,
      stack: error.stack,
      status: error.statusCode,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ msg: error.message });
  }
};

const getPurchaseById = async (req, res) => {
  const { id } = req.params;

  try {
    const purchase = await db.Purchase.findOne({
      where: { id },
      include: [
        {
          model: db.Supplier,
          as: "Supplier",
          attributes: ["id", "name"],
        },
        {
          model: db.PurchaseProduct,
          as: "PurchaseProducts",
          include: [
            {
              model: db.Product,
              as: "Product",
              attributes: ["id", "designation", "stock", "priceUnite"],
            },
          ],
        },
        {
          model: db.PurchaseBox,
          as: "PurchaseBoxes",
          include: [
            {
              model: db.Box,
              as: "Box",
              attributes: ["id", "designation", "inStock", "empty"],
            },
          ],
        },
        {
          model: db.PurchaseWaste,
          as: "PurchaseWastes",
          attributes: ["purchase_id", "product", "type", "qtt", "supplier"],
          include: [
            {
              model: db.Product,
              as: "Product",
              attributes: ["id", "designation"],
              required: false,
            },
          ],
        },
      ],
    });

    if (!purchase) {
      throw new ErrorCustom.NotFoundError(`Purchase with ID ${id} not found`);
    }

    const WastesArray = {
      purchaseId: purchase.id,
      details: purchase.PurchaseWastes.map((waste) => ({
        product_id: waste.product,
        designation: waste.Product?.designation || `Produit ${waste.product}`,
        qtt: waste.qtt,
        type: waste.type,
      })),
    };

    const purchaseWithWastes = {
      ...purchase.toJSON(),
      WastesArray,
    };

    console.log("Purchase fetched:", JSON.stringify(purchaseWithWastes, null, 2));

    res.status(StatusCodes.OK).json({
      status: "success",
      data: { purchase: purchaseWithWastes },
    });
  } catch (error) {
    console.error("getPurchaseById error:", {
      message: error.message,
      stack: error.stack,
      status: error.statusCode,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ msg: error.message });
  }
};

const sendToSupplier = async (req, res) => {
  const { id } = req.params;
  const { boxes, wastes } = req.body;

  try {
    const purchase = await db.Purchase.findByPk(id, {
      include: [
        {
          model: db.Supplier,
          as: "Supplier",
          attributes: ["id", "name"],
        },
        {
          model: db.PurchaseBox,
          as: "PurchaseBoxes",
          include: [{ model: db.Box, as: "Box" }],
        },
        {
          model: db.PurchaseWaste,
          as: "PurchaseWastes",
          include: [
            {
              model: db.Product,
              as: "Product",
              attributes: ["id", "designation"],
              required: false,
            },
          ],
        },
      ],
    });

    if (!purchase) {
      throw new ErrorCustom.NotFoundError(`Purchase with ID ${id} not found`);
    }

    if (!purchase.Supplier) {
      throw new ErrorCustom.NotFoundError(`Supplier for purchase ID ${id} not found`);
    }

    if (!boxes && !wastes) {
      throw new ErrorCustom.BadRequestError("At least one of boxes or wastes must be provided");
    }

    if (boxes && Array.isArray(boxes) && boxes.length > 0) {
      for (const box of boxes) {
        const dbBox = purchase.PurchaseBoxes.find((b) => b.box === parseInt(box.box_id));
        if (!dbBox) {
          throw new ErrorCustom.BadRequestError(`Box ID ${box.box_id} not found in purchase`);
        }
        if (box.qttIn !== dbBox.qttIn || box.qttOut !== dbBox.qttOut) {
          throw new ErrorCustom.BadRequestError(`Box ID ${box.box_id} data does not match purchase`);
        }
      }
    }

    if (wastes && Array.isArray(wastes) && wastes.length > 0) {
      for (const waste of wastes) {
        const dbWaste = purchase.PurchaseWastes.find(
          (w) => w.product === parseInt(waste.product_id) && w.type === waste.type
        );
        if (!dbWaste) {
          throw new ErrorCustom.BadRequestError(
            `Waste product ID ${waste.product_id} with type ${waste.type} not found in purchase`
          );
        }
        if (waste.qtt !== dbWaste.qtt) {
          throw new ErrorCustom.BadRequestError(
            `Waste product ID ${waste.product_id} quantity does not match purchase`
          );
        }
      }
    }

    console.log(`Sending to supplier for purchase ${id}:`, {
      supplier: purchase.Supplier?.name,
      boxes,
      wastes,
    });

    if (db.Notification) {
      await db.Notification.create({
        purchase_id: id,
        supplier_id: purchase.supplier,
        data: JSON.stringify({ boxes, wastes }),
        status: "pending",
        created_at: new Date(),
      });
    }

    res.status(StatusCodes.OK).json({
      message: "Data sent to supplier successfully",
    });
  } catch (error) {
    console.error("sendToSupplier error:", {
      message: error.message,
      stack: error.stack,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};

const getTotalPurchaseAmount = async (req, res) => {
  try {
    const { Purchase, Supplier } = db;
    if (!Purchase || !Supplier) {
      throw new Error("Purchase or Supplier model not defined");
    }

    const { startDate, endDate, search, minTotal, maxTotal } = req.query;

    const where = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }
    if (minTotal) where.total = { ...where.total, [Op.gte]: parseFloat(minTotal) };
    if (maxTotal) where.total = { ...where.total, [Op.lte]: parseFloat(maxTotal) };
    if (search) {
      where[Op.or] = [
        { "$Supplier.name$": { [Op.iLike]: `%${search}%` } },
        { "$Supplier.phone$": { [Op.iLike]: `%${search}%` } },
      ];
    }

    const result = await Purchase.findOne({
      attributes: [[db.sequelize.fn("SUM", db.sequelize.col("total")), "totalPurchaseAmount"]],
      where,
      include: [
        {
          model: Supplier,
          attributes: [],
        },
      ],
      raw: true,
    });

    const totalPurchaseAmount = parseFloat(result.totalPurchaseAmount) || 0;

    res.status(200).json({
      success: true,
      totalPurchaseAmount,
    });
  } catch (error) {
    console.error("Error in getTotalPurchaseAmount:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erreur lors du calcul du montant total des achats",
    });
  }
};

module.exports = {
  createPurchase,
  createBoxWastePurchase,
  getAllPurchases,
  getPurchaseById,
  sendToSupplier,
  getTotalPurchaseAmount,
};