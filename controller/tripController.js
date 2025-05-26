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
              attributes: ["designation", "priceUnite", "capacityByBox"],
            },
          ],
          attributes: ["product", "qttOut", "qttOutUnite"],
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
          attributes: ["box", "qttOut"],
        },
      ],
    });
    console.log("getTripById result:", trip ? trip.toJSON() : null);

    if (!trip) {
      throw new CustomError.NotFoundError(
        `Tournée avec ID ${parsedTripId} non trouvée`
      );
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
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({
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

    console.log("Received startTrip data:", req.body);

    if (!truck_matricule || !driver_id || !seller_id || !date || !zone) {
      throw new CustomError.BadRequestError(
        "Tous les champs requis doivent être remplis."
      );
    }

    const truck = await db.Truck.findOne({
      where: { matricule: truck_matricule },
      transaction,
    });
    if (!truck) {
      throw new CustomError.NotFoundError("Camion non trouvé.");
    }

    const driver = await db.Employee.findOne({
      where: { cin: driver_id },
      transaction,
    });
    const seller = await db.Employee.findOne({
      where: { cin: seller_id },
      transaction,
    });
    if (!driver || !seller) {
      throw new CustomError.NotFoundError("Conducteur ou vendeur non trouvé.");
    }

    let assistant = null;
    if (assistant_id) {
      assistant = await db.Employee.findOne({
        where: { cin: assistant_id },
        transaction,
      });
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
    console.error("startTrip error:", error.message, error.stack);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Erreur serveur lors du démarrage de la tournée." });
  }
};

const finishTrip = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id: tripId } = req.params;
    const { tripProducts, tripBoxes, tripWastes, tripCharges, receivedAmount } = req.body;

    const parsedTripId = parseInt(tripId, 10);
    if (isNaN(parsedTripId)) {
      throw new CustomError.BadRequestError("ID de tournée invalide, doit être un nombre");
    }

    console.log("Fetching trip with ID:", parsedTripId);
    // *** ADD INCLUDES HERE ***
    const trip = await db.Trip.findByPk(parsedTripId, {
      include: [
        {
          model: db.TripProduct,
          as: "TripProducts",
          include: [
            {
              model: db.Product,
              as: "ProductAssociation",
              attributes: ["capacityByBox"], // Include capacityByBox for qttVendu calculation
            },
          ],
        },
        {
          model: db.TripBox,
          as: "TripBoxes",
        },
      ],
      transaction,
    });

    if (!trip) {
      throw new CustomError.NotFoundError(`Tournée avec ID ${parsedTripId} non trouvée`);
    }

    // ... (rest of your finishTrip function)

    // Example of how to safely access qttOut and qttOutUnite after including:
    if (tripProducts && Array.isArray(tripProducts)) {
      await Promise.all(
        tripProducts.map(async (product) => {
          const initialProductData = trip.TripProducts.find(
            (tp) => tp.product === product.product_id
          );

          // Ensure initialProductData is found before accessing its properties
          const qttOut = initialProductData?.qttOut || 0;
          const qttOutUnite = initialProductData?.qttOutUnite || 0;
          const capacityByBox = initialProductData?.ProductAssociation?.capacityByBox || 1; // Default to 1 to avoid division by zero

          const qttReutour = product.qttReutour || 0;
          const qttReutourUnite = product.qttReutourUnite || 0;

          // Calculate qttVendu
          const qttVendu = (qttOut - qttReutour) * capacityByBox + (qttOutUnite - qttReutourUnite);

          // ... then proceed with update/create
          // ...
          await db.TripProduct.upsert( // Using upsert for simpler update/create logic
            {
              trip: parsedTripId,
              product: product.product_id,
              qttOut, // Use the fetched initial qttOut
              qttOutUnite, // Use the fetched initial qttOutUnite
              qttReutour,
              qttReutourUnite,
              qttVendu,
            },
            {
              where: { trip: parsedTripId, product: product.product_id },
              transaction,
            }
          );
        })
      );
    }
    // Similar safe access for TripBoxes
    if (tripBoxes && Array.isArray(tripBoxes)) {
      await Promise.all(
        tripBoxes.map(async (box) => {
          const initialBoxData = trip.TripBoxes.find(
            (tb) => tb.box === box.box_id
          );
          const qttOut = initialBoxData?.qttOut || 0;

          await db.TripBox.upsert(
            {
              trip: parsedTripId,
              box: box.box_id,
              qttOut,
              qttIn: box.qttIn || 0,
            },
            {
              where: { trip: parsedTripId, box: box.box_id },
              transaction,
            }
          );
        })
      );
    }

    // ... (rest of your finishTrip function)
  } catch (error) {
    await transaction.rollback();
    console.error("finishTrip error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message || "Erreur lors de la fin de la tournée." });
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
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({
        message:
          "Erreur lors de la récupération des données du dernier camion.",
      });
  }
};

const getTrips = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    if (isNaN(parsedPage) || isNaN(parsedLimit) || parsedLimit <= 0) {
      throw new CustomError.BadRequestError("Les paramètres de pagination doivent être des nombres valides.");
    }

    const offset = (parsedPage - 1) * parsedLimit;

    const queryOptions = {
      where: { isActive: false },
      include: [
        { model: db.Truck, as: 'TruckAssociation', attributes: ['matricule'], required: false },
        { model: db.Employee, as: 'DriverAssociation', attributes: ['name'], required: false },
        { model: db.Employee, as: 'SellerAssociation', attributes: ['name'], required: false },
        { model: db.Employee, as: 'AssistantAssociation', attributes: ['name'], required: false },
        {
          model: db.TripProduct,
          as: 'TripProducts',
          attributes: ['product', 'qttOut', 'qttOutUnite', 'qttReutour', 'qttReutourUnite', 'qttVendu'],
          include: [
            { model: db.Product, as: 'ProductAssociation', attributes: ['designation', 'priceUnite', 'capacityByBox'] },
          ],
          required: false,
        },
        {
          model: db.TripBox,
          as: 'TripBoxes',
          attributes: ['box', 'qttOut', 'qttIn'],
          include: [
            { model: db.Box, as: 'BoxAssociation', attributes: ['designation'] },
          ],
          required: false,
        },
      ],
      limit: parsedLimit,
      offset,
    };

    console.log("Executing getTrips query...");
    const { count, rows } = await db.Trip.findAndCountAll(queryOptions);
    console.log("getTrips result:", { count, rows: rows.map(row => row.toJSON()) });

    res.status(StatusCodes.OK).json({
      trips: rows,
      totalItems: count,
      totalPages: Math.ceil(count / parsedLimit),
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error("getTrips error:", error.message, error.stack);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message || "Erreur lors de la récupération des tournées." });
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
      wastes: [],
      charges: [],
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
      let tripWastes = [];
      let tripCharges = [];
      try {
        tripWastes = await db.TripWaste.findAll({
          where: { trip: parsedTripId },
        });
      } catch (err) {
        console.warn("Failed to fetch TripWastes for invoice:", err.message);
        tripWastes = [];
      }

      try {
        tripCharges = await db.TripCharge.findAll({
          where: { trip: parsedTripId },
        });
      } catch (err) {
        console.warn("Failed to fetch TripCharges for invoice:", err.message);
        tripCharges = [];
      }

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
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Erreur lors de la génération de la facture." });
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
