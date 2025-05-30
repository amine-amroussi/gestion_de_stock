const db = require("../models");
const CustomError = require("../errors");
const { StatusCodes } = require("http-status-codes");

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
                  attributes: ["designation"],
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
      totalCharges: plainTrip.TripCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0),
      totalWastes: plainTrip.TripWastes.reduce((sum, waste) => sum + (waste.qtt || 0), 0),
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
      tripProducts,
      tripBoxes,
    } = req.body;

    const ifTheTruckIsGo = await db.Trip.findOne({
      where: { isActive: true, truck_matricule },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
      ],
    });

    if (ifTheTruckIsGo) {
      throw new CustomError.BadRequestError("Cette Camion est deja sortie");
    }

    // Validate required fields (including assistant_id)
    if (!truck_matricule || !driver_id || !seller_id || !date || !zone) {
      throw new CustomError.BadRequestError(
        "Tous les champs requis doivent être remplis, y compris l'assistant."
      );
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

    // Validate assistant (required)
    const assistant = await db.Employee.findOne({
      where: { cin: assistant_id },
      transaction,
    });
    // if (!assistant) {
    //   throw new CustomError.NotFoundError(`Assistant avec CIN ${assistant_id} non trouvé.`);
    // }

    // Validate tripProducts
    if (tripProducts && tripProducts.length > 0) {
      for (const p of tripProducts) {
        const product = await db.Product.findOne({
          where: { id: p.product_id },
          transaction,
        });
        if (!product) {
          throw new CustomError.NotFoundError(
            `Produit avec ID ${p.product_id} non trouvé.`
          );
        }
      }
    } else {
      throw new CustomError.BadRequestError(
        "Au moins un produit est requis pour démarrer une tournée."
      );
    }

    // Validate tripBoxes
    if (tripBoxes && tripBoxes.length > 0) {
      for (const b of tripBoxes) {
        const box = await db.Box.findOne({
          where: { id: b.box_id },
          transaction,
        });
        if (!box) {
          throw new CustomError.NotFoundError(
            `Boîte avec ID ${b.box_id} non trouvée.`
          );
        }
      }
    } else {
      throw new CustomError.BadRequestError(
        "Au moins une boîte est requise pour démarrer une tournée."
      );
    }

    // Create the trip
    const trip = await db.Trip.create(
      {
        truck_matricule,
        driver_id,
        seller_id,
        assistant_id: assistant_id || null, // No need for || null since it's required
        date,
        zone,
        isActive: true,
      },
      { transaction }
    );
    console.log("Trip created with ID:", trip.id, "isActive:", trip.isActive);

    // Create TripProducts
    if (tripProducts && tripProducts.length > 0) {
      const productRecords = tripProducts.map((p) => ({
        trip: trip.id,
        product: p.product_id,
        qttOut: p.qttOut,
        qttOutUnite: p.qttOutUnite || 0,
      }));
      await db.TripProduct.bulkCreate(productRecords, { transaction });
      console.log("TripProducts created for trip:", trip.id);
    }

    // Create TripBoxes
    if (tripBoxes && tripBoxes.length > 0) {
      const boxRecords = tripBoxes.map((b) => ({
        trip: trip.id,
        box: b.box_id,
        qttOut: b.qttOut,
      }));
      await db.TripBox.bulkCreate(boxRecords, { transaction });
      console.log("TripBoxes created for trip:", trip.id);
    }

    // Fetch the full trip with associations
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
      ],
      transaction,
    });

    await transaction.commit();
    console.log("Transaction committed for trip:", trip.id);

    res.status(StatusCodes.CREATED).json({ trip: fullTrip });
  } catch (error) {
    await transaction.rollback();
    console.log(error);

    console.error("startTrip error:", error.message, error.stack);
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
        console.log(`Updating TripProduct ${tripProduct.product_id}:`, {
          qttReutour: tripProduct.qttReutour,
          qttReutourUnite: tripProduct.qttReutourUnite,
        });
        product.qttReutour = tripProduct.qttReutour;
        product.qttReutourUnite = tripProduct.qttReutourUnite;
        product.qttVendu =
          _product.capacityByBox * (product.qttOut - tripProduct.qttReutour) +
          (product.qttOutUnite - tripProduct.qttReutourUnite);
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

    console.log("Fetching TripProducts for stock update...");
    const tripProductsData = await db.TripProduct.findAll({
      where: { trip: parsedTripId },
      transaction,
    });
    const tripBoxesData = await db.TripBox.findAll({
      where: { trip: parsedTripId },
      transaction,
    });

    console.log("Updating Product stock...");
    await Promise.all(
      tripProductsData.map(async (tripProduct) => {
        const product = await db.Product.findOne({
          where: { id: tripProduct.product },
          transaction,
        });
        if (tripProduct.qttReutour > tripProduct.qttOut) {
          throw new CustomError.BadRequestError(
            `La quantité retournée du produit ${tripProduct.designation} est supérieure à la quantité sortie`
          );
        }
        if (product) {
          console.log(
            `Updating Product stock for product ${tripProduct.product}:`,
            {
              stockIncrease: tripProduct.qttReutour,
              uniteInStockIncrease: tripProduct.qttReutourUnite,
            }
          );
          product.stock += tripProduct.qttReutour;
          product.uniteInStock += tripProduct.qttReutourUnite;
          await product.save({ transaction });
        }
      })
    );

    console.log("Updating Box stock...");
    await Promise.all(
      tripBoxesData.map(async (tripBox) => {
        const box = await db.Box.findOne({
          where: { id: tripBox.box },
          transaction,
        });
        if (tripBox.qttIn < tripBox.qttOut) {
          console.log(
            `Warning: qttIn (${tripBox.qttIn}) is less than qttOut (${tripBox.qttOut}) for box ${tripBox.box}`
          );
        }
        if (box) {
          console.log(`Updating Box stock for box ${tripBox.box}:`, {
            inStockIncrease: tripBox.qttIn,
            sentDecrease: tripBox.qttOut,
            emptyIncrease: tripBox.qttIn,
          });
          box.inStock += tripBox.qttIn;
          box.sent -= tripBox.qttOut;
          box.empty += tripBox.qttIn;
          await box.save({ transaction });
        }
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
          return createdWaste;
        })
      );
    }

    let tripChargesData = [];
    if (tripCharges && tripCharges.length > 0) {
      console.log("Processing TripCharges...");
      tripChargesData = await Promise.all(
        tripCharges.map(async (tripCharge) => {
          const createCharge = await db.Charge.create(
            {
              type: tripCharge.type,
              amount: tripCharge.amount,
            },
            { transaction }
          );
          return await db.TripCharges.create(
            {
              trip: parsedTripId,
              charge: createCharge.id,
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
      const productPrice = tripProduct.product.priceUnite;
      const qttVendu = tripProduct.qttVendu;
      waitedAmount += productPrice * qttVendu;
    });

    console.log("Updating trip financials:", { waitedAmount, receivedAmount });
    trip.waitedAmount = waitedAmount;
    trip.receivedAmount = receivedAmount;
    trip.benefit = waitedAmount - receivedAmount;
    trip.deff = receivedAmount - waitedAmount;
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
      details: error.details,
      requestBody: req.body,
    });
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
      attributes: ["box", "qttIn"],
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
    const { page = 1, limit = 10 } = req.query;
    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    if (isNaN(parsedPage) || isNaN(parsedLimit)) {
      throw new CustomError.BadRequestError(
        "Les paramètres de pagination doivent être des nombres."
      );
    }

    const offset = (parsedPage - 1) * parsedLimit;
    const { count, rows } = await db.Trip.findAndCountAll({
      where: { isActive: false },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        { model: db.Employee, as: "DriverAssociation", attributes: ["name"] },
        { model: db.Employee, as: "SellerAssociation", attributes: ["name"] },
      ],
      limit: parsedLimit,
      offset,
    });

    res.status(StatusCodes.OK).json({
      trips: rows,
      totalItems: count,
      totalPages: Math.ceil(count / parsedLimit),
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error("getTrips error:", error.message, error.stack);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Erreur lors de la récupération des tournées." });
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
        product: tw.WasteAssociation?.ProductAssociation?.designation || tw.product || "Inconnu",
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
    console.log("getAllProducts result:", products.map(p => p.toJSON()));

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
    console.log("getAllEmployees result:", employees.map(e => e.toJSON()));

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
};