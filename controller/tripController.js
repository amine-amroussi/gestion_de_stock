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
      throw new CustomError.BadRequestError("ID de tournée invalide, doit être un nombre");
    }

    const trip = await db.Trip.findOne({
      where: { id: parsedTripId },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        { model: db.Employee, as: "DriverAssociation", attributes: ["name"] },
        { model: db.Employee, as: "SellerAssociation", attributes: ["name"] },
        { model: db.Employee, as: "AssistantAssociation", attributes: ["name"] },
        {
          model: db.TripProduct,
          as: "TripProducts",
          include: [
            { model: db.Product, as: "ProductAssociation", attributes: ["designation", "priceUnite", "capacityByBox"] },
          ],
          attributes: ["product", "qttOut", "qttOutUnite"],
        },
        {
          model: db.TripBox,
          as: "TripBoxes",
          include: [
            { model: db.Box, as: "BoxAssociation", attributes: ["designation"] },
          ],
          attributes: ["box", "qttOut"],
        },
      ],
    });
    console.log("getTripById result:", trip ? trip.toJSON() : null);

    if (!trip) {
      throw new CustomError.NotFoundError(`Tournée avec ID ${parsedTripId} non trouvée`);
    }

    res.status(StatusCodes.OK).json({ trip });
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
        { model: db.Employee, as: "AssistantAssociation", attributes: ["name"] },
      ],
    });
    console.log("Raw activeTrips result:", activeTrips);
    console.log("getActiveTrips result:", activeTrips.map(trip => trip.toJSON()));

    if (!activeTrips || activeTrips.length === 0) {
      console.log("No active trips found in database");
      return res.status(StatusCodes.OK).json({ trips: [] });
    }

    res.status(StatusCodes.OK).json({ trips: activeTrips });
  } catch (error) {
    console.error("getActiveTrips error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Erreur lors de la récupération des tournées actives." });
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

    console.log("Received startTrip data:", req.body);

    if (!truck_matricule || !driver_id || !seller_id || !date || !zone) {
      throw new CustomError.BadRequestError("Tous les champs requis doivent être remplis.");
    }

    const truck = await db.Truck.findOne({ where: { matricule: truck_matricule }, transaction });
    if (!truck) {
      throw new CustomError.NotFoundError("Camion non trouvé.");
    }

    const driver = await db.Employee.findOne({ where: { cin: driver_id }, transaction });
    const seller = await db.Employee.findOne({ where: { cin: seller_id }, transaction });
    if (!driver || !seller) {
      throw new CustomError.NotFoundError("Conducteur ou vendeur non trouvé.");
    }

    let assistant = null;
    if (assistant_id) {
      assistant = await db.Employee.findOne({ where: { cin: assistant_id }, transaction });
      if (!assistant) {
        throw new CustomError.NotFoundError("Assistant non trouvé.");
      }
    }

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

    if (tripBoxes && tripBoxes.length > 0) {
      const boxRecords = tripBoxes.map((b) => ({
        trip: trip.id,
        box: b.box_id,
        qttOut: b.qttOut,
      }));
      await db.TripBox.bulkCreate(boxRecords, { transaction });
      console.log("TripBoxes created for trip:", trip.id);
    }

    const fullTrip = await db.Trip.findOne({
      where: { id: trip.id },
      include: [
        { model: db.Truck, as: "TruckAssociation", attributes: ["matricule"] },
        { model: db.Employee, as: "DriverAssociation", attributes: ["name"] },
        { model: db.Employee, as: "SellerAssociation", attributes: ["name"] },
        { model: db.Employee, as: "AssistantAssociation", attributes: ["name"] },
      ],
      transaction,
    });

    await transaction.commit();
    console.log("Transaction committed for trip:", trip.id);

    res.status(StatusCodes.CREATED).json({ trip: fullTrip });
  } catch (error) {
    await transaction.rollback();
    console.error("startTrip error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Erreur serveur lors du démarrage de la tournée." });
  }
};

const finishTrip = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id: trip_id } = req.params;
    const { tripProducts, tripBoxes, tripWastes, tripCharges, receivedAmount } = req.body;

    if (!tripProducts || !tripBoxes || !trip_id) {
      throw new CustomError.BadRequestError("Veuillez fournir toutes les valeurs nécessaires");
    }

    const parsedTripId = parseInt(trip_id, 10);
    if (isNaN(parsedTripId)) {
      throw new CustomError.BadRequestError("ID de tournée invalide, doit être un nombre");
    }

    const trip = await db.Trip.findOne({ where: { id: parsedTripId }, transaction });
    if (!trip) {
      throw new CustomError.NotFoundError(`Tournée avec ID ${parsedTripId} non trouvée`);
    }

    await Promise.all(
      tripProducts.map(async (tripProduct) => {
        const product = await db.TripProduct.findOne({
          where: { product: tripProduct.product_id, trip: parsedTripId },
          transaction,
        });
        const _product = await db.Product.findOne({ where: { id: tripProduct.product_id }, transaction });
        if (product) {
          product.qttReutour = tripProduct.qttReutour;
          product.qttReutourUnite = tripProduct.qttReutourUnite;
          product.qttVendu =
            _product.capacityByBox * (product.qttOut - tripProduct.qttReutour) +
            (product.qttOutUnite - tripProduct.qttReutourUnite);
          await product.save({ transaction });
        }
      })
    );

    await Promise.all(
      tripBoxes.map(async (tripBox) => {
        const box = await db.TripBox.findOne({
          where: { box: tripBox.box_id, trip: parsedTripId },
          transaction,
        });
        if (box) {
          box.qttIn = tripBox.qttIn;
          await box.save({ transaction });
        }
      })
    );

    const tripProductsData = await db.TripProduct.findAll({ where: { trip: parsedTripId }, transaction });
    const tripBoxesData = await db.TripBox.findAll({ where: { trip: parsedTripId }, transaction });

    await Promise.all(
      tripProductsData.map(async (tripProduct) => {
        const product = await db.Product.findOne({ where: { id: tripProduct.product }, transaction });
        if (tripProduct.qttReutour > tripProduct.qttOut) {
          throw new CustomError.BadRequestError(
            `La quantité retournée du produit ${tripProduct.designation} est supérieure à la quantité sortie`
          );
        }
        if (product) {
          product.stock += tripProduct.qttReutour;
          product.uniteInStock += tripProduct.qttReutourUnite;
          await product.save({ transaction });
        }
      })
    );

    await Promise.all(
      tripBoxesData.map(async (tripBox) => {
        const box = await db.Box.findOne({ where: { id: tripBox.box }, transaction });
        if (tripBox.qttIn < tripBox.qttOut) {
          throw new CustomError.BadRequestError(
            `La quantité entrée est inférieure à la quantité sortie`
          );
        }
        if (box) {
          box.inStock += tripBox.qttIn;
          box.sent -= tripBox.qttOut;
          box.empty += tripBox.qttIn;
          await box.save({ transaction });
        }
      })
    );

    const tripProductsWithInfo = await Promise.all(
      tripProductsData.map(async (tripProduct) => {
        const product = await db.Product.findOne({
          where: { id: tripProduct.product },
          include: [{ model: db.Box, as: "BoxAssociation", attributes: ["capacity"] }],
          attributes: ["id", "designation", "priceUnite", "box"],
          transaction,
        });
        return { ...tripProduct.toJSON(), product };
      })
    );

    let tripWastesData = {};
    if (tripWastes) {
      tripWastesData = await db.TripWaste.create(
        {
          trip: parsedTripId,
          product: tripWastes.product,
          type: tripWastes.type,
          qtt: tripWastes.qtt,
        },
        { transaction }
      );
      const waste = await db.Waste.findOne({
        where: { product: tripWastes.product, type: tripWastes.type },
        transaction,
      });
      if (waste) {
        await waste.update({ qtt: waste.qtt + tripWastes.qtt }, { transaction });
      } else {
        await db.Waste.create(
          {
            product: tripWastes.product,
            type: tripWastes.type,
            qtt: tripWastes.qtt,
          },
          { transaction }
        );
      }
    }

    let tripChargesData = [];
    if (tripCharges) {
      tripChargesData = await Promise.all(
        tripCharges.map(async (tripCharge) => {
          const createCharge = await db.Charge.create(
            {
              type: tripCharge.type,
              amount: tripCharge.amount,
            },
            { transaction }
          );
          return await db.TripCharge.create(
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

    let waitedAmount = 0;
    tripProductsWithInfo.forEach((tripProduct) => {
      const productPrice = tripProduct.product.priceUnite;
      const qttVendu = tripProduct.qttVendu;
      waitedAmount += productPrice * qttVendu;
    });

    trip.waitedAmount = waitedAmount;
    trip.receivedAmount = receivedAmount;
    trip.benefit = waitedAmount - receivedAmount;
    trip.deff = receivedAmount - waitedAmount;
    trip.isActive = false;
    await trip.save({ transaction });

    await transaction.commit();
    res.status(StatusCodes.OK).json({
      message: "Tournée terminée avec succès",
      trip,
      tripWastes: tripWastesData,
      tripCharges: tripChargesData,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("finishTrip error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Erreur lors de la finalisation de la tournée." });
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
      include: [{ model: db.Product, as: "ProductAssociation", attributes: ["designation"] }],
      attributes: ["product", "qttReutour", "qttReutourUnite"],
    });
    const tripBoxes = await db.TripBox.findAll({
      where: { trip: trip.id },
      include: [{ model: db.Box, as: "BoxAssociation", attributes: ["designation"] }],
      attributes: ["box", "qttIn"],
    });
    res.status(StatusCodes.OK).json({
      trip,
      tripProducts,
      tripBoxes,
    });
  } catch (error) {
    console.error("getRestInLastTruck error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Erreur lors de la récupération des données du dernier camion." });
  }
};

const getTrips = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    if (isNaN(parsedPage) || isNaN(parsedLimit)) {
      throw new CustomError.BadRequestError("Les paramètres de pagination doivent être des nombres.");
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
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Erreur lors de la récupération des tournées." });
  }
};

const generateInvoice = async (req, res) => {
  try {
    const { id: tripId } = req.params;
    const { type } = req.query;

    const parsedTripId = parseInt(tripId, 10);
    if (isNaN(parsedTripId)) {
      throw new CustomError.BadRequestError("ID de tournée invalide, doit être un nombre");
    }

    if (!type) {
      throw new CustomError.BadRequestError("Veuillez fournir le type de facture (matin ou après-midi)");
    }

    if (!["morning", "afternoon"].includes(type)) {
      throw new CustomError.BadRequestError("Le type de facture doit être 'morning' ou 'afternoon'");
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
      throw new CustomError.NotFoundError(`Tournée avec ID ${parsedTripId} non trouvée`);
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
      const tripWastes = await db.TripWaste.findAll({ where: { trip: parsedTripId } });
      const tripCharges = await db.TripCharge.findAll({ where: { trip: parsedTripId } });

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
        product: tw.product,
        type: tw.type,
        qtt: tw.qtt,
      }));
      invoice.charges = tripCharges.map((tc) => ({
        type: tc.type,
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
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Erreur lors de la génération de la facture." });
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
};
