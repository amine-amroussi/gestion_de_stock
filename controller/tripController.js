const db = require("../models");
const CustomError = require("../errors");
const { StatusCodes } = require("http-status-codes");
const { Op } = require("sequelize");
const Product = require("../models/Product");

const getTripById = async (req, res) => {
  try {
    const { tripId } = req.params;
    const parsedTripId = parseInt(tripId, 10);
    console.log(`Fetching trip with ID: ${parsedTripId}`);
    if (isNaN(parsedTripId)) {
      console.warn(`Invalid trip ID format: ${tripId}`);
      throw new CustomError.BadRequestError(
        "ID de tournée invalide, doit être un nombre"
      );
    }

    const trip = await db.Trip.findOne({
      where: { id: parsedTripId },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        {
          model: db.Employee,
          as: "DriverAssociation",
          attributes: ["name", "cin"],
        },
        {
          model: db.Employee,
          as: "SellerAssociation",
          attributes: ["name", "cin"],
        },
        {
          model: db.Employee,
          as: "AssistantAssociation",
          attributes: ["name", "cin"],
        },
        {
          model: db.TripProduct,
          as: "TripProducts",
          include: [
            {
              model: db.Product,
              as: "ProductAssociation",
              attributes: ["designation", "priceUnite", "capacityByBox"],
            },
          ],
          attributes: [
            "product",
            "qttOut",
            "qttOutUnite",
            "qttReutour",
            "qttReutourUnite",
            "qttVendu",
          ],
        },
        {
          model: db.TripBox,
          as: "TripBoxes",
          include: [
            {
              model: db.Box,
              as: "BoxAssociation",
              attributes: ["designation"],
            },
          ],
          attributes: ["box", "qttOut", "qttIn"],
        },
        {
          model: db.TripWaste,
          as: "TripWastes",
          include: [
            {
              model: db.Waste,
              as: "WasteAssociation",
              include: [
                {
                  model: db.Product,
                  as: "ProductAssociation",
                  attributes: ["designation", "priceUnite"],
                },
              ],
            },
          ],
          attributes: ["product", "type", "qtt"],
        },
        {
          model: db.TripCharges,
          as: "TripCharges",
          include: [
            {
              model: db.Charge,
              as: "ChargeAssociation",
              attributes: ["type"],
            },
          ],
          attributes: ["amount"],
        },
      ],
    });
    console.log("getTripById result:", trip ? trip.toJSON() : null);

    if (!trip) {
      throw new CustomError.NotFoundError(
        `Tournée avec ID ${parsedTripId} non trouvée`
      );
    }

    const plainTrip = JSON.parse(
      JSON.stringify(trip.toJSON(), (key, value) => {
        if (key === "parent" || key === "include") return undefined;
        return value;
      })
    );

    const tripWithComputedUnits = {
      ...plainTrip,
      TripProducts: plainTrip.TripProducts.map((tp) => {
        const product = tp.ProductAssociation;
        if (
          product &&
          !tp.qttVendu &&
          tp.qttOut !== null &&
          tp.qttOutUnite !== null
        ) {
          const totalUnitsOut =
            (tp.qttOut || 0) * (product.capacityByBox || 0) +
            (tp.qttOutUnite || 0);
          const totalUnitsReturned =
            (tp.qttReutour || 0) * (product.capacityByBox || 0) +
            (tp.qttReutourUnite || 0);
          return {
            ...tp,
            totalUnitsOut: totalUnitsOut,
            totalUnitsReturned: totalUnitsReturned,
            qttVendu: totalUnitsOut - totalUnitsReturned,
          };
        }
        return tp;
      }),
      totalCharges: plainTrip.TripCharges.reduce(
        (sum, charge) => sum + (charge.amount || 0),
        0
      ),
      totalWastes: plainTrip.TripWastes.reduce(
        (sum, waste) => sum + (waste.qtt || 0),
        0
      ),
    };

    res.status(StatusCodes.OK).json({ trip: tripWithComputedUnits });
  } catch (error) {
    console.error("getTripById error:", error.message, error.stack);
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};

const getActiveTrips = async (req, res) => {
  try {
    console.log("Searching for all active trips with isActive = true");
    const activeTrips = await db.Trip.findAll({
      where: { isActive: true },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        { model: db.Employee, as: "DriverAssociation", attributes: ["name"] },
        { model: db.Employee, as: "SellerAssociation", attributes: ["name"] },
        {
          model: db.Employee,
          as: "AssistantAssociation",
          attributes: ["name"],
        },
      ],
    });
    console.log("Raw activeTrips result:", activeTrips);
    console.log(
      "getActiveTrips result:",
      activeTrips.map((trip) => trip.toJSON())
    );

    if (!activeTrips || activeTrips.length === 0) {
      console.log("No active trips found in database");
      return res.status(StatusCodes.OK).json({ trips: [] });
    }

    res.status(StatusCodes.OK).json({ trips: activeTrips });
  } catch (error) {
    console.error("getActiveTrips error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Erreur lors de la récupération des tournées actives.",
    });
  }
};
const startTrip = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      truck_matricule,
      driver_id,
      seller_id,
      assistant_id,
      date,
      zone,
      tripProducts = [], // Default to empty array if not provided
      tripBoxes = [], // Default to empty array if not provided
    } = req.body;

    console.log("++++++++Received startTrip request:", {
      truck_matricule,
      driver_id,
      seller_id,
      assistant_id,
      date,
      zone,
      tripProducts,
      tripBoxes,
    });

    // Validate required fields
    if (!truck_matricule || !driver_id || !seller_id || !date || !zone) {
      throw new CustomError.BadRequestError(
        "Tous les champs requis doivent être remplis."
      );
    }

    // Check if truck is already on an active trip
    const ifTheTruckIsGo = await db.Trip.findOne({
      where: { isActive: true, truck_matricule },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
      ],
      transaction,
    });

    if (ifTheTruckIsGo) {
      throw new CustomError.BadRequestError("Ce camion est déjà sorti");
    }

    // Validate truck
    const truck = await db.Truck.findOne({
      where: { matricule: truck_matricule },
      transaction,
    });
    if (!truck) {
      throw new CustomError.NotFoundError(
        `Camion avec matricule ${truck_matricule} non trouvé.`
      );
    }

    // Validate driver
    const driver = await db.Employee.findOne({
      where: { cin: driver_id },
      transaction,
    });
    if (!driver) {
      throw new CustomError.NotFoundError(
        `Conducteur avec CIN ${driver_id} non trouvé.`
      );
    }

    // Validate seller
    const seller = await db.Employee.findOne({
      where: { cin: seller_id },
      transaction,
    });
    if (!seller) {
      throw new CustomError.NotFoundError(
        `Vendeur avec CIN ${seller_id} non trouvé.`
      );
    }

    // Validate assistant (optional)
    const assistant = assistant_id
      ? await db.Employee.findOne({
          where: { cin: assistant_id },
          transaction,
        })
      : null;

    // Validate tripProducts if provided
    if (tripProducts.length > 0) {
      for (const p of tripProducts) {
        if (
          !p.product_id ||
          p.newQttOut < 0 ||
          p.newQttOutUnite < 0 ||
          p.qttOut < 0 ||
          p.qttOutUnite < 0
        ) {
          throw new CustomError.BadRequestError(
            `Produit ID ${p.product_id} invalide ou quantités négatives.`
          );
        }
        const product = await db.Product.findOne({
          where: { id: p.product_id },
          transaction,
        });

        if (!product) {
          throw new CustomError.NotFoundError(
            `Produit avec ID ${p.product_id} non trouvé.`
          );
        }
        if (
          p.newQttOut > product.stock ||
          p.newQttOutUnite > product.uniteInStock
        ) {
          throw new CustomError.BadRequestError(
            `Stock insuffisant pour le produit ID ${p.product_id}. Stock: ${product.stock} caisses, ${product.uniteInStock} unités.`
          );
        }
      }
    }

    // Validate tripBoxes if provided
    if (tripBoxes.length > 0) {
      for (const b of tripBoxes) {
        if (!b.box_id || b.newQttOut < 0) {
          throw new CustomError.BadRequestError(
            `Boîte ID ${b.box_id} invalide ou quantité négative.`
          );
        }
        const box = await db.Box.findOne({
          where: { id: b.box_id },
          transaction,
        });
        if (!box) {
          throw new CustomError.NotFoundError(
            `Boîte avec ID ${b.box_id} non trouvée.`
          );
        }
        if (b.newQttOut > box.inStock) {
          throw new CustomError.BadRequestError(
            `Stock insuffisant pour la boîte ID ${b.box_id}. Stock: ${box.inStock}.`
          );
        }
      }
    }

    // Fetch remaining items from last trip
    const lastTrip = await db.Trip.findOne({
      where: { truck_matricule, isActive: false },
      order: [["date", "DESC"]],
      include: [
        {
          model: db.TripProduct,
          as: "TripProducts",
          attributes: ["product", "qttReutour", "qttReutourUnite"],
        },
        {
          model: db.TripBox,
          as: "TripBoxes",
          attributes: ["box", "qttIn"],
        },
      ],
      transaction,
    });

    const remainingProducts =
      lastTrip?.TripProducts?.map((tp) => ({
        product_id: tp.product,
        qttOut: tp.qttReutour || 0,
        qttOutUnite: tp.qttReutourUnite || 0,
      })) || [];

    const remainingBoxes =
      lastTrip?.TripBoxes?.map((tb) => ({
        box_id: tb.box,
        qttOut: tb.qttIn || 0,
      })) || [];

    // Validate that at least one product exists (remaining or new)
    if (tripProducts.length === 0 && remainingProducts.length === 0) {
      throw new CustomError.BadRequestError(
        "Au moins un produit est requis pour démarrer une tournée."
      );
    }

    // Validate that at least one box exists (remaining or new)
    if (tripBoxes.length === 0 && remainingBoxes.length === 0) {
      throw new CustomError.BadRequestError(
        "Au moins une boîte est requise pour démarrer une tournée."
      );
    }

    // Merge remaining and new quantities for TripProduct creation
    const mergedProducts = [];
    const productMap = new Map();

    // Add remaining products
    remainingProducts.forEach((p) => {
      productMap.set(p.product_id, {
        product_id: p.product_id,
        qttOut: p.qttOut,
        qttOutUnite: p.qttOutUnite,
      });
    });

    // Add new products, summing quantities if product exists
    tripProducts.forEach((p) => {
      if (productMap.has(p.product_id)) {
        const existing = productMap.get(p.product_id);
        existing.qttOut += p.qttOut;
        existing.qttOutUnite += p.qttOutUnite;
      } else {
        productMap.set(p.product_id, {
          product_id: p.product_id,
          qttOut: p.qttOut,
          qttOutUnite: p.qttOutUnite,
        });
      }
    });

    productMap.forEach((p) => mergedProducts.push(p));

    // Merge remaining and new boxes
    const mergedBoxes = [];
    const boxMap = new Map();

    // Add remaining boxes
    remainingBoxes.forEach((b) => {
      boxMap.set(b.box_id, {
        box_id: b.box_id,
        qttOut: b.qttOut,
      });
    });

    // Add new boxes, summing quantities if box exists
    tripBoxes.forEach((b) => {
      if (boxMap.has(b.box_id)) {
        const existing = boxMap.get(b.box_id);
        existing.qttOut += b.qttOut;
      } else {
        boxMap.set(b.box_id, {
          box_id: b.box_id,
          qttOut: b.qttOut,
        });
      }
    });

    boxMap.forEach((b) => mergedBoxes.push(b));

    // Create trip
    const trip = await db.Trip.create(
      {
        truck_matricule,
        driver_id,
        seller_id,
        assistant_id: assistant_id || null,
        date,
        zone,
        isActive: true,
      },
      { transaction }
    );
    console.log("Trip created with ID:", trip.id, "isActive:", trip.isActive);

    // Create TripProducts with merged quantities
    const productRecords = tripProducts.map((p) => ({
      trip: trip.id,
      product: p.product_id,
      qttOut: p.qttOut + p.newQttOut || 0,
      qttOutUnite: p.qttOutUnite + p.newQttOutUnite || 0,
    }));
    const tripProductsCreated = await db.TripProduct.bulkCreate(
      productRecords,
      {
        transaction,
      }
    );
    console.log(
      "TripProducts created:",
      tripProductsCreated.map((tp) => tp.toJSON())
    );

    // Create TripBoxes with merged quantities
    const boxRecords = tripBoxes.map((b) => ({
      trip: trip.id,
      box: b.box_id,
      qttOut: b.newQttOut + b.qttOut,
    }));
    const tripBoxesCreated = await db.TripBox.bulkCreate(boxRecords, {
      transaction,
    });
    console.log(
      "TripBoxes created:",
      tripBoxesCreated.map((tb) => tb.toJSON())
    );

    // Update product quantities (only for new quantities, if any)
    if (tripProducts.length > 0) {
      console.log("Updating product quantities...");
      await Promise.all(
        tripProducts.map(async (tripProduct) => {
          const product = await db.Product.findOne({
            where: { id: tripProduct.product_id },
            transaction,
          });
          if (product) {
            console.log(`Updating product ${tripProduct.product_id}:`, {
              stockBefore: product.stock,
              uniteInStockBefore: product.uniteInStock,
              qttOut: tripProduct.qttOut,
              qttOutUnite: tripProduct.qttOutUnite,
            });
            product.stock -= tripProduct.qttOut;
            product.uniteInStock -= tripProduct.qttOutUnite;
            if (product.stock < 0 || product.uniteInStock < 0) {
              throw new CustomError.BadRequestError(
                `Stock négatif non autorisé pour le produit ID ${tripProduct.product_id}.`
              );
            }
            await product.save({ transaction });
            console.log(`Updated product ${tripProduct.product_id}:`, {
              stockAfter: product.stock,
              uniteInStockAfter: product.uniteInStock,
            });
          }
        })
      );
    } else {
      console.log("No new products provided; skipping product stock update.");
    }

    // Update box quantities (only for new quantities, if any)
    if (tripBoxes.length > 0) {
      console.log("Updating box quantities...");
      await Promise.all(
        tripBoxes.map(async (tripBox) => {
          const box = await db.Box.findOne({
            where: { id: tripBox.box_id },
            transaction,
          });
          if (box) {
            console.log(`Updating box ${tripBox.box_id}:`, {
              inStockBefore: box.inStock,
              sentBefore: box.sent,
              qttOut: tripBox.qttOut,
            });
            box.inStock -= tripBox.newQttOut;
            box.sent += tripBox.newQttOut;
            if (box.inStock < 0) {
              throw new CustomError.BadRequestError(
                `Stock négatif non autorisé pour la boîte ID ${tripBox.box_id}.`
              );
            }
            await box.save({ transaction });
            console.log(`Updated box ${tripBox.box_id}:`, {
              inStockAfter: box.inStock,
              sentAfter: box.sent,
            });
          }
        })
      );
    } else {
      console.log("No new boxes provided; skipping box stock update.");
    }

    // Fetch full trip details
    const fullTrip = await db.Trip.findOne({
      where: { id: trip.id },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        { model: db.Employee, as: "DriverAssociation", attributes: ["name"] },
        { model: db.Employee, as: "SellerAssociation", attributes: ["name"] },
        {
          model: db.Employee,
          as: "AssistantAssociation",
          attributes: ["name"],
        },
        {
          model: db.TripProduct,
          as: "TripProducts",
          include: [
            {
              model: db.Product,
              as: "ProductAssociation",
              attributes: ["designation"],
            },
          ],
        },
        {
          model: db.TripBox,
          as: "TripBoxes",
          include: [
            {
              model: db.Box,
              as: "BoxAssociation",
              attributes: ["designation"],
            },
          ],
        },
      ],
      transaction,
    });

    await transaction.commit();
    console.log("Transaction committed for trip:", trip.id);

    res.status(StatusCodes.CREATED).json({ trip: fullTrip });
  } catch (error) {
    console.log(error);

    await transaction.rollback();
    console.error("startTrip error:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};
const finishTrip = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id: trip_id } = req.params;
    const { tripProducts, tripBoxes, tripWastes, tripCharges, receivedAmount } =
      req.body;

    console.log("Received finishTrip request:", {
      trip_id,
      tripProducts: JSON.stringify(tripProducts, null, 2),
      tripBoxes: JSON.stringify(tripBoxes, null, 2),
      tripWastes: JSON.stringify(tripWastes, null, 2),
      tripCharges: JSON.stringify(tripCharges, null, 2),
      receivedAmount,
    });

    if (!tripProducts || !tripBoxes || !trip_id) {
      throw new CustomError.BadRequestError(
        "Veuillez fournir toutes les valeurs nécessaires"
      );
    }

    const parsedTripId = parseInt(trip_id, 10);
    if (isNaN(parsedTripId)) {
      throw new CustomError.BadRequestError(
        "ID de tournée invalide, doit être un nombre"
      );
    }

    console.log(`Fetching trip with ID ${parsedTripId}`);
    const trip = await db.Trip.findOne({
      where: { id: parsedTripId },
      transaction,
    });
    if (!trip) {
      throw new CustomError.NotFoundError(
        `Tournée avec ID ${parsedTripId} non trouvée`
      );
    }
    console.log("Found trip:", trip.toJSON());

    const wasteByProduct = tripWastes.reduce((acc, waste) => {
      const productId = Number(waste.product);
      acc[productId] = (acc[productId] || 0) + (parseInt(waste.qtt) || 0);
      return acc;
    }, {});

    console.log("Waste quantities by product:", wasteByProduct);

    console.log("Updating TripProducts...");
    await Promise.all(
      tripProducts.map(async (tripProduct) => {
        console.log(
          `Fetching TripProduct for product_id ${tripProduct.product_id} and trip ${parsedTripId}`
        );
        const product = await db.TripProduct.findOne({
          where: { product: tripProduct.product_id, trip: parsedTripId },
          transaction,
        });
        if (!product) {
          throw new CustomError.NotFoundError(
            `TripProduct with product_id ${tripProduct.product_id} and trip ${parsedTripId} not found`
          );
        }
        console.log(
          `Fetching Product for product_id ${tripProduct.product_id}`
        );
        const _product = await db.Product.findOne({
          where: { id: tripProduct.product_id },
          transaction,
        });
        if (!_product) {
          throw new CustomError.NotFoundError(
            `Product with ID ${tripProduct.product_id} not found`
          );
        }

        const wasteQtt = wasteByProduct[tripProduct.product_id] || 0;

        console.log(`Updating TripProduct ${tripProduct.product_id}:`, {
          qttReutour: tripProduct.qttReutour,
          qttReutourUnite: tripProduct.qttReutourUnite,
          wasteQtt,
        });
        product.qttReutour = tripProduct.qttReutour;
        product.qttReutourUnite = tripProduct.qttReutourUnite;

        const totalUnitsOut =
          _product.capacityByBox * (product.qttOut || 0) +
          (product.qttOutUnite || 0);
        const totalUnitsReturned =
          _product.capacityByBox * (tripProduct.qttReutour || 0) +
          (tripProduct.qttReutourUnite || 0);
        const totalUnitsWasted = wasteQtt;
        product.qttVendu =
          totalUnitsOut - totalUnitsReturned - totalUnitsWasted;

        if (product.qttVendu < 0) {
          throw new CustomError.BadRequestError(
            `Quantité vendue négative pour le produit ${tripProduct.product_id} après déduction des déchets.`
          );
        }
        if (tripProduct.qttReutour > product.qttOut) {
          throw new CustomError.BadRequestError(
            `La quantité retournée du produit ${tripProduct.product_id} est supérieure à la quantité sortie (caisses).`
          );
        }
        if (tripProduct.qttReutourUnite + wasteQtt > product.qttOutUnite) {
          throw new CustomError.BadRequestError(
            `La quantité retournée (unités) plus déchets pour le produit ${tripProduct.product_id} est supérieure à la quantité sortie (unités).`
          );
        }

        await product.save({ transaction });
      })
    );

    console.log("Updating TripBoxes...");
    await Promise.all(
      tripBoxes.map(async (tripBox) => {
        console.log(
          `Fetching TripBox for box_id ${tripBox.box_id} and trip ${parsedTripId}`
        );
        const box = await db.TripBox.findOne({
          where: { box: tripBox.box_id, trip: parsedTripId },
          transaction,
        });
        if (!box) {
          throw new CustomError.NotFoundError(
            `TripBox with box_id ${tripBox.box_id} and trip ${parsedTripId} not found`
          );
        }
        console.log(`Updating TripBox ${tripBox.box_id}:`, {
          qttIn: tripBox.qttIn,
        });
        box.qttIn = tripBox.qttIn;
        await box.save({ transaction });
      })
    );

    console.log("Fetching TripProducts and TripBoxes for validation...");
    const tripProductsData = await db.TripProduct.findAll({
      where: { trip: parsedTripId },
      transaction,
    });
    const tripBoxesData = await db.TripBox.findAll({
      where: { trip: parsedTripId },
      transaction,
    });

    console.log("Updating Box stock...");
    await Promise.all(
      tripBoxesData.map(async (tripBox) => {
        const box = await db.Box.findOne({
          where: { id: tripBox.box },
          transaction,
        });
        if (!box) {
          throw new CustomError.NotFoundError(
            `Box with ID ${tripBox.box} not found`
          );
        }
        console.log(`Box validation for box ${tripBox.box}:`, {
          qttIn: tripBox.qttIn,
          qttOut: tripBox.qttOut,
          currentSent: box.sent,
          emptyBefore: box.empty,
        });
        if (tripBox.qttIn > tripBox.qttOut) {
          throw new CustomError.BadRequestError(
            `Returned quantity (${tripBox.qttIn}) for box ID ${tripBox.box} exceeds sent quantity (${tripBox.qttOut})`
          );
        }
        if (tripBox.qttIn < 0) {
          throw new CustomError.BadRequestError(
            `Negative returned quantity (${tripBox.qttIn}) for box ID ${tripBox.box} not allowed`
          );
        }
        const newSent = box.sent - tripBox.qttIn;
        if (newSent < 0) {
          console.warn(
            `Warning: Updating box ${tripBox.box} would result in negative sent value`,
            {
              currentSent: box.sent,
              qttIn: tripBox.qttIn,
              newSent,
            }
          );
          // Proceed without throwing error to debug
        }
        console.log(`Updating Box stock for box ${tripBox.box}:`, {
          emptyBefore: box.empty,
          sentBefore: box.sent,
          emptyIncrease: tripBox.qttIn,
          sentDecrease: tripBox.qttIn,
        });
        box.empty += tripBox.qttIn;
        box.sent -= tripBox.qttIn;
        await box.save({ transaction });
        console.log(`Updated Box stock for box ${tripBox.box}:`, {
          emptyAfter: box.empty,
          sentAfter: box.sent,
        });
      })
    );

    console.log("Fetching TripProducts with product info for financials...");
    const tripProductsWithInfo = await Promise.all(
      tripProductsData.map(async (tripProduct) => {
        const product = await db.Product.findOne({
          where: { id: tripProduct.product },
          attributes: ["id", "designation", "priceUnite"],
          transaction,
        });
        return { ...tripProduct.toJSON(), product };
      })
    );

    let tripWastesData = [];
    let totalWasteCost = 0;
    if (tripWastes && tripWastes.length > 0) {
      console.log("Processing TripWastes...");
      tripWastesData = await Promise.all(
        tripWastes.map(async (waste) => {
          const createdWaste = await db.TripWaste.create(
            {
              trip: parsedTripId,
              product: waste.product,
              type: waste.type,
              qtt: waste.qtt,
            },
            { transaction }
          );
          const existingWaste = await db.Waste.findOne({
            where: { product: waste.product, type: waste.type },
            transaction,
          });
          if (existingWaste) {
            await existingWaste.update(
              { qtt: existingWaste.qtt + waste.qtt },
              { transaction }
            );
          } else {
            await db.Waste.create(
              {
                product: waste.product,
                type: waste.type,
                qtt: waste.qtt,
              },
              { transaction }
            );
          }
          const product = await db.Product.findOne({
            where: { id: waste.product },
            attributes: ["priceUnite"],
            transaction,
          });
          if (product) {
            totalWasteCost += (waste.qtt || 0) * (product.priceUnite || 0);
          }
          return createdWaste;
        })
      );
    }

    let tripChargesData = [];
    if (tripCharges && tripCharges.length > 0) {
      console.log("Processing TripCharges...");
      tripChargesData = await Promise.all(
        tripCharges.map(async (tripCharge) => {
          const today = new Date().getDate();
          const createdCharge = await db.Charge.create(
            {
              type: tripCharge.type,
              amount: tripCharge.amount,
              date: trip.date,
            },
            { transaction }
          );
          return await db.TripCharges.create(
            {
              trip: parsedTripId,
              charge: createdCharge.id,
              type: tripCharge.type,
              amount: tripCharge.amount,
            },
            { transaction }
          );
        })
      );
    }

    console.log("Calculating financials...");
    let waitedAmount = 0;
    tripProductsWithInfo.forEach((tripProduct) => {
      const productPrice = tripProduct.product?.priceUnite || 0;
      const qttVendu = tripProduct.qttVendu || 0;
      waitedAmount += productPrice * qttVendu;
    });

    const totalCharges = tripChargesData.reduce(
      (total, charge) => total + (charge.amount || 0),
      0
    );
    waitedAmount = waitedAmount - totalCharges - totalWasteCost;

    const adjustedReceivedAmount = parseFloat(receivedAmount) || 0;

    if (adjustedReceivedAmount < 0) {
      throw new CustomError.BadRequestError(
        "Le montant reçu après déduction des charges et des coûts de déchets ne peut pas être négatif."
      );
    }

    if (waitedAmount < 0) {
      throw new CustomError.BadRequestError(
        "Le montant attendu après déduction des charges et des coûts de déchets ne peut pas être négatif."
      );
    }

    console.log("Updating trip financials:", {
      waitedAmount,
      receivedAmount: adjustedReceivedAmount,
      totalCharges,
      totalWasteCost,
    });

    trip.waitedAmount = waitedAmount;
    trip.receivedAmount = adjustedReceivedAmount;
    trip.benefit = adjustedReceivedAmount - totalCharges;
    trip.deff = adjustedReceivedAmount - waitedAmount;
    trip.isActive = false;
    await trip.save({ transaction });

    await transaction.commit();
    console.log("Transaction committed successfully");
    res.status(StatusCodes.OK).json({
      message: "Tournée terminée avec succès",
      trip,
      tripWastes: tripWastesData,
      tripCharges: tripChargesData,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("finishTrip error:", {
      message: error.message,
      stack: error.stack,
      status: error.statusCode,
      requestBody: req.body,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};

const emptyTruck = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { matricule } = req.params;
    console.log(`Emptying truck with matricule: ${matricule}`);

    const lastTrip = await db.Trip.findOne({
      where: { truck_matricule: matricule, isActive: false },
      order: [["date", "DESC"]],
      transaction,
    });

    if (!lastTrip) {
      throw new CustomError.NotFoundError(
        `Aucune tournée terminée trouvée pour le camion avec matricule ${matricule}`
      );
    }

    const tripProducts = await db.TripProduct.findAll({
      where: { trip: lastTrip.id },
      include: [
        {
          model: db.Product,
          as: "ProductAssociation",
          attributes: ["id", "designation"],
        },
      ],
      attributes: ["product", "qttReutour", "qttReutourUnite"],
      transaction,
    });

    const tripBoxes = await db.TripBox.findAll({
      where: { trip: lastTrip.id },
      include: [
        {
          model: db.Box,
          as: "BoxAssociation",
          attributes: ["id", "designation"],
        },
      ],
      attributes: ["box", "qttIn"],
      transaction,
    });

    await Promise.all(
      tripProducts.map(async (tripProduct) => {
        const product = await db.Product.findOne({
          where: { id: tripProduct.product },
          transaction,
        });
        if (product) {
          console.log(
            `Updating Product stock for product ${tripProduct.product}:`,
            {
              stockIncrease: tripProduct.qttReutour,
              uniteInStockIncrease: tripProduct.qttReutourUnite,
            }
          );
          product.stock += tripProduct.qttReutour || 0;
          product.uniteInStock += tripProduct.qttReutourUnite || 0;
          await product.save({ transaction });
        }
      })
    );

    await Promise.all(
      tripBoxes.map(async (tripBox) => {
        const box = await db.Box.findOne({
          where: { id: tripBox.box },
          transaction,
        });
        if (box) {
          console.log(`Updating Box stock for box ${tripBox.box}:`, {
            inStockIncrease: tripBox.qttIn,
          });
          box.inStock += tripBox.qttIn || 0;
          box.sent += tripBox.qttIn || 0;
          box.empty += tripBox.qttIn || 0;
          await box.save({ transaction });
        }
      })
    );

    await db.TripProduct.update(
      { qttReutour: 0, qttReutourUnite: 0 },
      { where: { trip: lastTrip.id }, transaction }
    );

    await db.TripBox.update(
      { qttIn: 0 },
      { where: { trip: lastTrip.id }, transaction }
    );

    await transaction.commit();
    console.log(`Truck ${matricule} emptied successfully`);
    res.status(StatusCodes.OK).json({
      message: `Camion ${matricule} vidé avec succès. Tout a été retourné au stock.`,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("emptyTruck error:", {
      message: error.message,
      stack: error.stack,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};

const getPreviousTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const parsedTripId = parseInt(tripId, 10);
    console.log(`Fetching previous trip for trip ID: ${parsedTripId}`);
    if (isNaN(parsedTripId)) {
      console.warn(`Invalid trip ID format: ${tripId}`);
      throw new CustomError.BadRequestError("ID de tournée invalide, doit être un nombre");
    }

    // Find the selected trip to get its truck_matricule and date
    const selectedTrip = await db.Trip.findOne({
      where: { id: parsedTripId },
      attributes: ["truck_matricule", "date"],
    });

    if (!selectedTrip) {
      throw new CustomError.NotFoundError(`Tournée avec ID ${parsedTripId} non trouvée`);
    }

    // Find the previous trip for the same truck with a date earlier than the selected trip
    const previousTrip = await db.Trip.findOne({
      where: {
        truck_matricule: selectedTrip.truck_matricule,
        date: { [Op.lt]: selectedTrip.date },
      },
      order: [["date", "DESC"]],
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        { model: db.Employee, as: "DriverAssociation", attributes: ["name", "cin"] },
        { model: db.Employee, as: "SellerAssociation", attributes: ["name", "cin"] },
        { model: db.Employee, as: "AssistantAssociation", attributes: ["name", "cin"] },
        {
          model: db.TripProduct,
          as: "TripProducts",
          include: [
            {
              model: db.Product,
              as: "ProductAssociation",
              attributes: ["designation", "priceUnite", "capacityByBox"],
            },
          ],
          attributes: ["product", "qttOut", "qttOutUnite", "qttReutour", "qttReutourUnite", "qttVendu"],
        },
        {
          model: db.TripBox,
          as: "TripBoxes",
          include: [{ model: db.Box, as: "BoxAssociation", attributes: ["designation"] }],
          attributes: ["box", "qttOut", "qttIn"],
        },
        {
          model: db.TripWaste,
          as: "TripWastes",
          include: [
            {
              model: db.Waste,
              as: "WasteAssociation",
              include: [{ model: db.Product, as: "ProductAssociation", attributes: ["designation", "priceUnite"] }],
            },
          ],
          attributes: ["product", "type", "qtt"],
        },
        {
          model: db.TripCharges,
          as: "TripCharges",
          include: [{ model: db.Charge, as: "ChargeAssociation", attributes: ["type"] }],
          attributes: ["amount"],
        },
      ],
    });

    if (!previousTrip) {
      console.log(`No previous trip found for truck_matricule: ${selectedTrip.truck_matricule}`);
      return res.status(StatusCodes.OK).json({ previousTrip: null });
    }

    const plainPreviousTrip = JSON.parse(
      JSON.stringify(previousTrip.toJSON(), (key, value) => {
        if (key === "parent" || key === "include") return undefined;
        return value;
      })
    );

    const previousTripWithComputedUnits = {
      ...plainPreviousTrip,
      TripProducts: plainPreviousTrip.TripProducts.map((tp) => {
        const product = tp.ProductAssociation;
        if (product && !tp.qttVendu && tp.qttOut !== null && tp.qttOutUnite !== null) {
          const totalUnitsOut = (tp.qttOut || 0) * (product.capacityByBox || 0) + (tp.qttOutUnite || 0);
          const totalUnitsReturned = (tp.qttReutour || 0) * (product.capacityByBox || 0) + (tp.qttReutourUnite || 0);
          return {
            ...tp,
            totalUnitsOut: totalUnitsOut,
            totalUnitsReturned: totalUnitsReturned,
            qttVendu: totalUnitsOut - totalUnitsReturned,
          };
        }
        return tp;
      }),
      totalCharges: plainPreviousTrip.TripCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0),
      totalWastes: plainPreviousTrip.TripWastes.reduce((sum, waste) => sum + (waste.qtt || 0), 0),
    };

    res.status(StatusCodes.OK).json({ previousTrip: previousTripWithComputedUnits });
  } catch (error) {
    console.error("getPreviousTrip error:", error.message, error.stack);
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};
const getRestInLastTruck = async (req, res) => {
  try {
    const { id: truck_matricule } = req.params;
    const trip = await db.Trip.findOne({
      where: { truck_matricule, isActive: false },
      order: [["date", "DESC"]],
    });
    if (!trip) {
      throw new CustomError.NotFoundError(
        `Tournée avec matricule de camion ${truck_matricule} non trouvée`
      );
    }
    const tripProducts = await db.TripProduct.findAll({
      where: { trip: trip.id },
      include: [
        {
          model: db.Product,
          as: "ProductAssociation",
          attributes: ["designation"],
        },
      ],
      attributes: ["product", "qttReutour", "qttReutourUnite"],
    });
    const tripBoxes = await db.TripBox.findAll({
      where: { trip: trip.id },
      include: [
        { model: db.Box, as: "BoxAssociation", attributes: ["designation"] },
      ],
      attributes: ["box", "qttIn", "qttOut"],
    });
    res.status(StatusCodes.OK).json({
      trip,
      tripProducts,
      tripBoxes,
    });
  } catch (error) {
    console.error("getRestInLastTruck error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Erreur lors de la récupération des données du dernier camion.",
    });
  }
};

const getTrips = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      employee,
      truck,
      status,
      sortBy = "date",
      sortOrder = "DESC",
      search,
    } = req.query;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    if (isNaN(parsedPage) || isNaN(parsedLimit)) {
      throw new CustomError.BadRequestError(
        "Les paramètres de pagination doivent être des nombres."
      );
    }

    const where = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = new Date(startDate);
      if (endDate) where.date[Op.lte] = new Date(endDate);
    }

    if (status === "active") where.isActive = true;
    else if (status === "completed") where.isActive = false;

    if (truck) {
      where.truck_matricule = { [Op.like]: `%${truck}%` };
    }

    if (search) {
      where[Op.or] = [
        { zone: { [Op.like]: `%${search}%` } },
        { id: { [Op.eq]: parseInt(search, 10) || 0 } },
      ];
    }

    const include = [
      {
        model: db.Truck,
        as: "TruckAssociation",
        attributes: ["matricule"],
        required: truck ? true : false,
      },
      {
        model: db.Employee,
        as: "DriverAssociation",
        attributes: ["name"],
        required: false,
      },
      {
        model: db.Employee,
        as: "SellerAssociation",
        attributes: ["name"],
        where: employee ? { cin: { [Op.like]: `%${employee}%` } } : null,
        required: !!employee, // Only require SellerAssociation if employee filter is provided
      },
      {
        model: db.Employee,
        as: "AssistantAssociation",
        attributes: ["name"],
        required: false,
      },
    ];

    const validSortFields = ["date", "zone", "waitedAmount", "receivedAmount"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "date";
    const sortDirection = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const offset = (parsedPage - 1) * parsedLimit;
    const { count, rows } = await db.Trip.findAndCountAll({
      where,
      include,
      order: [[sortField, sortDirection]],
      limit: parsedLimit,
      offset,
      distinct: true,
    });

    res.status(StatusCodes.OK).json({
      trips: rows,
      totalItems: count,
      totalPages: Math.ceil(count / parsedLimit),
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error("getTrips error:", error.message, error.stack);
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ message: error.message });
  }
};

const generateInvoice = async (req, res) => {
  try {
    const { id: tripId } = req.params;
    const { type } = req.query;

    const parsedTripId = parseInt(tripId, 10);
    if (isNaN(parsedTripId)) {
      throw new CustomError.BadRequestError(
        "ID de tournée invalide, doit être un nombre"
      );
    }

    if (!type) {
      throw new CustomError.BadRequestError(
        "Veuillez fournir le type de facture (matin ou après-midi)"
      );
    }

    if (!["morning", "afternoon"].includes(type)) {
      throw new CustomError.BadRequestError(
        "Le type de facture doit être 'morning' ou 'afternoon'"
      );
    }

    const trip = await db.Trip.findOne({
      where: { id: parsedTripId },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        { model: db.Employee, as: "DriverAssociation", attributes: ["name"] },
        { model: db.Employee, as: "SellerAssociation", attributes: ["name"] },
      ],
    });

    if (!trip) {
      throw new CustomError.NotFoundError(
        `Tournée avec ID ${parsedTripId} non trouvée`
      );
    }

    const tripProducts = await db.TripProduct.findAll({
      where: { trip: parsedTripId },
      include: [
        {
          model: db.Product,
          as: "ProductAssociation",
          attributes: ["designation", "priceUnite"],
        },
      ],
    });

    const tripBoxes = await db.TripBox.findAll({
      where: { trip: parsedTripId },
      include: [
        { model: db.Box, as: "BoxAssociation", attributes: ["designation"] },
      ],
    });

    let invoice = {
      tripId: trip.id,
      date: trip.date,
      truck: trip.TruckAssociation?.matricule || "N/A",
      driver: trip.DriverAssociation?.name || "N/A",
      seller: trip.SellerAssociation?.name || "N/A",
      zone: trip.zone,
      products: [],
      boxes: [],
      totals: {},
    };

    if (type === "morning") {
      invoice.products = tripProducts.map((tp) => ({
        designation: tp.ProductAssociation.designation,
        qttOut: tp.qttOut,
        qttOutUnite: tp.qttOutUnite,
        priceUnite: tp.ProductAssociation.priceUnite,
      }));
      invoice.boxes = tripBoxes.map((tb) => ({
        designation: tb.BoxAssociation.designation,
        qttOut: tb.qttOut,
      }));
      invoice.totals = {
        estimatedRevenue: 0,
      };
    } else if (type === "afternoon") {
      const tripWastes = await db.TripWaste.findAll({
        where: { trip: parsedTripId },
        include: [
          {
            model: db.Waste,
            as: "WasteAssociation",
            include: [
              {
                model: db.Product,
                as: "ProductAssociation",
                attributes: ["designation"],
              },
            ],
          },
        ],
      });
      const tripCharges = await db.TripCharges.findAll({
        where: { trip: parsedTripId },
        include: [
          {
            model: db.Charge,
            as: "ChargeAssociation",
            attributes: ["type"],
          },
        ],
      });

      invoice.products = tripProducts.map((tp) => ({
        designation: tp.ProductAssociation.designation,
        qttOut: tp.qttOut,
        qttOutUnite: tp.qttOutUnite,
        qttReutour: tp.qttReutour,
        qttReutourUnite: tp.qttReutourUnite,
        qttVendu: tp.qttVendu,
        priceUnite: tp.ProductAssociation.priceUnite,
        totalRevenue: tp.qttVendu * tp.ProductAssociation.priceUnite,
      }));
      invoice.boxes = tripBoxes.map((tb) => ({
        designation: tb.BoxAssociation.designation,
        qttOut: tb.qttOut,
        qttIn: tb.qttIn,
      }));
      invoice.wastes = tripWastes.map((tw) => ({
        product:
          tw.WasteAssociation?.ProductAssociation?.designation ||
          tw.product ||
          "Inconnu",
        type: tw.type,
        qtt: tw.qtt,
      }));
      invoice.charges = tripCharges.map((tc) => ({
        type: tc.ChargeAssociation?.type || "N/A",
        amount: tc.amount,
      }));
      invoice.totals = {
        waitedAmount: trip.waitedAmount,
        receivedAmount: trip.receivedAmount,
        benefit: trip.benefit,
        deff: trip.deff,
      };
    }

    res.status(StatusCodes.OK).json({ invoice });
  } catch (error) {
    console.error("generateInvoice error:", error.message, error.stack);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Erreur lors de la génération de la facture." });
  }
};

const getAllProducts = async (req, res) => {
  try {
    console.log("Fetching all products without pagination...");
    const products = await db.Product.findAll({
      attributes: ["id", "designation", "priceUnite", "capacityByBox"],
    });
    console.log(
      "getAllProducts result:",
      products.map((p) => p.toJSON())
    );

    if (!products || products.length === 0) {
      console.log("No products found in database");
      return res.status(StatusCodes.OK).json({ products: [] });
    }

    res.status(StatusCodes.OK).json({ products });
  } catch (error) {
    console.error("getAllProducts error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Erreur lors de la récupération des produits.",
    });
  }
};

const getAllEmployees = async (req, res) => {
  try {
    console.log("Fetching all employees without pagination...");
    const employees = await db.Employee.findAll({
      attributes: ["cin", "name", "role"],
    });
    console.log(
      "getAllEmployees result:",
      employees.map((e) => e.toJSON())
    );

    if (!employees || employees.length === 0) {
      console.log("No employees found in database");
      return res.status(StatusCodes.OK).json({ employees: [] });
    }

    res.status(StatusCodes.OK).json({ employees });
  } catch (error) {
    console.error("getAllEmployees error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Erreur lors de la récupération des employés.",
    });
  }
};

const transferProducts = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      sourceTripId,
      destinationTripId,
      tripProducts = [],
      tripBoxes = [],
    } = req.body;

    console.log("Received transferProducts request:", {
      sourceTripId,
      destinationTripId,
      tripProducts,
      tripBoxes,
    });

    if (!sourceTripId || !destinationTripId) {
      throw new CustomError.BadRequestError(
        "Source et destination de la tournée sont requis."
      );
    }

    const parsedSourceTripId = parseInt(sourceTripId.toString(), 10);
    const parsedDestinationTripId = parseInt(destinationTripId.toString(), 10);
    if (isNaN(parsedSourceTripId) || isNaN(parsedDestinationTripId)) {
      throw new CustomError.BadRequestError(
        "Les IDs de tournée doivent être des nombres."
      );
    }

    const sourceTrip = await db.Trip.findOne({
      where: { id: parsedSourceTripId },
      include: [
        {
          model: db.TripProduct,
          as: "TripProducts",
          attributes: [
            "product",
            "qttOut",
            "qttOutUnite",
            "qttReutour",
            "qttReutourUnite",
          ],
        },
        {
          model: db.TripBox,
          as: "TripBoxes",
          attributes: ["box", "qttOut", "qttIn"],
        },
      ],
      transaction,
    });

    if (!sourceTrip) {
      throw new CustomError.NotFoundError(
        `Tournée source avec ID ${parsedSourceTripId} non trouvée.`
      );
    }

    const destinationTrip = await db.Trip.findOne({
      where: { id: parsedDestinationTripId, isActive: true },
      transaction,
    });

    if (!destinationTrip) {
      throw new CustomError.NotFoundError(
        `Tournée destination avec ID ${parsedDestinationTripId} non trouvée ou non active.`
      );
    }

    if (tripProducts.length > 0) {
      await Promise.all(
        tripProducts.map(async (transferProduct) => {
          const {
            product_id,
            additionalQttOut = 0,
            additionalQttOutUnite = 0,
          } = transferProduct;
          const sourceProduct = sourceTrip.TripProducts.find(
            (tp) => Number(tp.product) === Number(product_id)
          );

          if (!sourceProduct) {
            throw new CustomError.BadRequestError(
              `Produit ID ${product_id} non trouvé dans la tournée source.`
            );
          }
          const remainingQtt =
            (sourceProduct.qttOut || 0) - (sourceProduct.qttReutour || 0);
          const remainingQttUnite =
            (sourceProduct.qttOutUnite || 0) -
            (sourceProduct.qttReutourUnite || 0);

          if (remainingQtt <= 0 && remainingQttUnite <= 0) {
            throw new CustomError.BadRequestError(
              `Aucune quantité restante pour le produit ID ${product_id} dans la tournée source.`
            );
          }
          const product = await db.Product.findOne({
            where: { id: product_id },
            transaction,
          });
          if (!product) {
            throw new CustomError.NotFoundError(
              `Produit avec ID ${product_id} non trouvé.`
            );
          }

          const destinationProduct = await db.TripProduct.findOne({
            where: { trip: parsedDestinationTripId, product: product_id },
            transaction,
          });

          if (destinationProduct) {
            destinationProduct.qttOut =
              (destinationProduct.qttOut || 0) +
              remainingQtt +
              (parseInt(additionalQttOut, 10) || 0);
            destinationProduct.qttOutUnite =
              (destinationProduct.qttOutUnite || 0) +
              remainingQttUnite +
              (parseInt(additionalQttOutUnite, 10) || 0);
            await destinationProduct.save({ transaction });
            console.log(
              `Updated TripProduct ${product_id} in destination trip.`
            );
          } else {
            await db.TripProduct.create(
              {
                trip: parsedDestinationTripId,
                product: product_id,
                qttOut: remainingQtt + (parseInt(additionalQttOut, 10) || 0),
                qttOutUnite:
                  remainingQttUnite +
                  (parseInt(additionalQttOutUnite, 10) || 0),
                qttReutour: 0,
                qttReutourUnite: 0,
              },
              { transaction }
            );
            console.log(
              `Created TripProduct ${product_id} in destination trip.`
            );
          }
        })
      );
    }

    if (tripBoxes.length > 0) {
      await Promise.all(
        tripBoxes.map(async (transferBox) => {
          const { box_id, additionalQttOut = 0 } = transferBox;
          const sourceBox = sourceTrip.TripBoxes.find(
            (tb) => Number(tb.box) === Number(box_id)
          );

          if (!sourceBox) {
            throw new CustomError.BadRequestError(
              `Boîte ID ${box_id} non trouvée dans la tournée source.`
            );
          }

          const remainingQtt = (sourceBox.qttOut || 0) - (sourceBox.qttIn || 0);

          if (remainingQtt <= 0) {
            throw new CustomError.BadRequestError(
              `Aucune quantité restante pour la boîte ID ${box_id} dans la tournée source.`
            );
          }
          const box = await db.Box.findOne({
            where: { id: box_id },
            transaction,
          });
          if (!box) {
            throw new CustomError.NotFoundError(
              `Boîte avec ID ${box_id} non trouvée.`
            );
          }

          let destinationBox = await db.TripBox.findOne({
            where: { trip: parsedDestinationTripId, box: box_id },
            transaction,
          });

          if (destinationBox) {
            destinationBox.qttOut =
              (destinationBox.qttOut || 0) +
              remainingQtt +
              (parseInt(additionalQttOut, 10) || 0);
            await destinationBox.save({ transaction });
            console.log(`Updated TripBox ${box_id} in destination trip.`);
          } else {
            await db.TripBox.create(
              {
                trip: parsedDestinationTripId,
                box: box_id,
                qttOut: remainingQtt + (parseInt(additionalQttOut, 10) || 0),
                qttIn: 0,
              },
              { transaction }
            );
            console.log(`Created TripBox ${box_id} in destination trip.`);
          }
        })
      );
    }

    await transaction.commit();
    console.log("Transfer transaction committed successfully");
    res.status(StatusCodes.OK).json({
      message: "Produits et boîtes transférés avec succès.",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("transferProducts error:", {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
    });
    const status = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ error: error.message });
  }
};

const getTotalTripRevenue = async (req, res) => {
  try {
    const { Trip, Employee } = db;
    if (!Trip || !Employee) {
      throw new Error("Trip or Employee model not defined");
    }

    const { startDate, endDate, search } = req.query;

    const where = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = startDate;
      if (endDate) where.date[Op.lte] = endDate;
    }
    if (search) {
      where[Op.or] = [
        { zone: { [Op.iLike]: `%${search}%` } },
        { "$Employee.name$": { [Op.iLike]: `%${search}%` } },
      ];
    }

    const result = await Trip.findOne({
      attributes: [
        [
          db.sequelize.fn("SUM", db.sequelize.col("receivedAmount")),
          "totalRevenue",
        ],
      ],
      where,
      include: [
        {
          model: Employee,
          attributes: [],
        },
      ],
      raw: true,
    });

    const totalRevenue = parseFloat(result.totalRevenue) || 0;

    res.status(200).json({
      success: true,
      totalRevenue,
    });
  } catch (error) {
    console.error("Error in getTotalTripRevenue:", error);
    res.status(500).json({
      success: false,
      message:
        error.message || "Erreur lors du calcul du revenu total des tournées",
    });
  }
};

module.exports = {
  startTrip,
  finishTrip,
  getRestInLastTruck,
  getTrips,
  getActiveTrips,
  getTripById,
  generateInvoice,
  getAllProducts,
  getAllEmployees,
  emptyTruck,
  getTotalTripRevenue,
  transferProducts,
  getPreviousTrip
};
