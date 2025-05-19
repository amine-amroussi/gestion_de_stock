const db = require("../models");
const CustomError = require("../errors");
const { StatusCodes } = require("http-status-codes");
const { get } = require("../routes/boxRoutes");
const { where } = require("sequelize");

const startTrip = async (req, res) => {
  // The Trip basic informations
  const { truck_matricule, driver_id, seller_id, date, zone, assistant_id } =
    req.body;
  // Trip Products and boxes
  const { tripProducts, tripBoxes } = req.body;

  // Check the trip data
  if (!tripProducts || !tripBoxes) {
    throw new CustomError.BadRequestError("Please provide all values");
  }
  if (!truck_matricule || !driver_id || !seller_id || !date || !zone) {
    throw new CustomError.BadRequestError("Please provide all values");
  }
  // Check if the truck is already in the database
  const truck = await db.Truck.findOne({
    where: { matricule: truck_matricule },
  });

  if (!truck) {
    throw new CustomError.NotFoundError(
      `Truck with matricule ${truck_matricule} not found`
    );
  }
  // Check if the driver is already in the database
  const driver = await db.Employee.findOne({
    where: { cin: driver_id },
  });
  if (!driver) {
    throw new CustomError.NotFoundError(
      `Driver with ID ${driver_id} not found`
    );
  }
  // Check if the seller is already in the database
  const seller = await db.Employee.findOne({
    where: { cin: seller_id },
  });
  if (!seller) {
    throw new CustomError.NotFoundError(
      `Seller with ID ${seller_id} not found`
    );
  }
  // Create the trip
  const trip = await db.Trip.create({
    truck_matricule,
    driver_id,
    seller_id,
    date,
    assistant_id: assistant_id ? assistant_id : null,
    zone,
  });
  // Create the trip products
  const tripProductsData = tripProducts.map((product) => ({
    trip: trip.id,
    product: product.product_id,
    qttOut: product.qttOut,
  }));
  const tripProductsCreated = await db.TripProduct.bulkCreate(tripProductsData);
  // Create the trip boxes
  const tripBoxesData = tripBoxes.map((box) => ({
    trip: trip.id,
    box: box.box_id,
    qttOut: box.qttOut,
  }));
  const tripBoxesCreated = await db.TripBox.bulkCreate(tripBoxesData);

  // Check if the trip products and boxes were created successfully and increase the quantity of the products and boxes
  if (!tripProductsCreated || !tripBoxesCreated) {
    throw new CustomError.BadRequestError(
      "Failed to create trip products or boxes"
    );
  }
  // Update the quantity of the products and boxes
  await Promise.all(
    tripProductsCreated.map(async (tripProduct) => {
      const product = await db.Product.findOne({
        where: { id: tripProduct.product },
      });
      if (product) {
        product.stock -= tripProduct.qttOut;
        product.uniteInStock -= tripProduct.qttOutUnite;
        await product.save();
      }
    })
  );
  // Update the quantity of the boxes
  await Promise.all(
    tripBoxesCreated.map(async (tripBox) => {
      const box = await db.Box.findOne({
        where: { id: tripBox.box },
      });
      if (box) {
        box.inStock -= tripBox.qttOut;
        box.sent += tripBox.qttOut;
        await box.save();
      }
    })
  );

  // Send the response
  res.status(StatusCodes.CREATED).json({
    trip: {
      id: trip.id,
      truck_matricule,
      driver_id,
      seller_id,
      date,
      zone,
      assistant_id: assistant_id ? assistant_id : null,
    },
    tripProducts: tripProductsCreated,
    tripBoxes: tripBoxesCreated,
  });
};

const finishTrip = async (req, res) => {
  const { id: trip_id } = req.params;
  const { tripProducts, tripBoxes, tripWastes, tripCharges, receivedAmount } =
    req.body;

  // Check if the trip data is provided
  if (!tripProducts || !tripBoxes) {
    throw new CustomError.BadRequestError("Please provide all values");
  }
  // Check if the trip ID is provided
  if (!trip_id) {
    throw new CustomError.BadRequestError("Please provide trip ID");
  }
  // Check if the trip products and boxes are provided
  if (!tripProducts || !tripBoxes) {
    throw new CustomError.BadRequestError("Please provide all values");
  }

  const trip = await db.Trip.findOne({
    where: { id: trip_id },
  });

  if (!trip) {
    throw new CustomError.NotFoundError(`Trip with ID ${trip_id} not found`);
  }

  //  update trip products and boxes
  await Promise.all(
    tripProducts.map(async (tripProduct) => {
      const product = await db.TripProduct.findOne({
        where: { product: tripProduct.product_id, trip: trip_id },
      });
      const _product = await db.Product.findOne({
        where: { id: tripProduct.product_id },
      });
      if (product) {
        product.qttReutour = tripProduct.qttReutour;
        product.qttReutourUnite = tripProduct.qttReutourUnite;
        product.qttVendu =
          _product.capacityByBox * (product.qttOut - tripProduct.qttReutour) +
          (product.qttOutUnite - tripProduct.qttReutourUnite);
        await product.save();
      }
    })
  );
  await Promise.all(
    tripBoxes.map(async (tripBox) => {
      const box = await db.TripBox.findOne({
        where: { box: tripBox.box_id, trip: trip_id },
      });
      if (box) {
        box.qttIn = tripBox.qttIn;
        await box.save();
      }
    })
  );

  // Check if the trip is already in the database
  // get trip products and boxes
  const tripProductsData = await db.TripProduct.findAll({
    where: { trip: trip_id },
  });
  const tripBoxesData = await db.TripBox.findAll({
    where: { trip: trip_id },
  });

  // Update the quantity of the products and boxes
  await Promise.all(
    tripProductsData.map(async (tripProduct) => {
      const product = await db.Product.findOne({
        where: { id: tripProduct.product },
      });
      if (tripProduct.qttReutour > tripProduct.qttOut) {
        throw new CustomError.BadRequestError(
          `La quantite de qui sorte de produit : ${tripProduct.designation} est inferieur a la quantite qui retourne`
        );
      }
      if (product) {
        product.stock += tripProduct.qttReutour;
        product.uniteInStock += tripProduct.qttReutourUnite;
        await product.save();
      }
    })
  );
  // Update the quantity of the boxes
  await Promise.all(
    tripBoxesData.map(async (tripBox) => {
      const box = await db.Box.findOne({
        where: { id: tripBox.box },
      });
      if (tripBox.qttIn < tripBox.qttOut) {
        throw new CustomError.BadRequestError(
          `La quantite qui entre est inferieur a la quantite qui sort`
        );
      }
      if (box) {
        box.inStock += tripBox.qttIn;
        box.sent -= tripBox.qttOut;
        box.empty += tripBox.qttIn;
        await box.save();
      }
    })
  );
  // get product information for each trip product
  const tripProductsWithInfo = await Promise.all(
    tripProductsData.map(async (tripProduct) => {
      const product = await db.Product.findOne({
        where: { id: tripProduct.product },
        include: [
          {
            model: db.Box,
            as: "BoxAssociation",
            attributes: ["capacity"],
          },
        ],
        attributes: ["id", "designation", "priceUnite", "box"],
      });
      return {
        ...tripProduct.toJSON(),
        product,
      };
    })
  );
  let tripWastesData = {};
  // if there is trip wastes and charges add to the trip
  if (tripWastes) {
    tripWastesData = await db.TripWaste.create({
      trip: trip_id,
      product: tripWastes.product,
      type: tripWastes.type,
      qtt: tripWastes.qtt,
    });
    // add to waste table
    // check if the waste is already in the database and increase just the quantity
    const waste = await db.Waste.findOne({
      where: { product: tripWastes.product, type: tripWastes.type },
    });
    if (waste) {
      await waste.update({ qtt: waste.qtt + tripWastes.qtt });
    } else {
      await db.Waste.create({
        product: tripWastes.product,
        type: tripWastes.type,
        qtt: tripWastes.qtt,
      });
    }
  }

  let tripChargesData = {};
  // add trip charges
  if (tripCharges) {
    tripCharges.forEach(async (tripCharge) => {
      const createCharge = await db.Charge.create({
        type: tripCharge.type,
        amount: tripCharge.amount,
      });
      // add charge to trip charge
      tripChargesData = await db.TripCharge.create({
        trip: trip_id,
        charge: createCharge.id,
        type: tripCharge.type,
        amount: tripCharge.amount,
      });
    });
  }

  // calculate waited amount
  let waitedAmount = 0;
  tripProductsWithInfo.forEach((tripProduct) => {
    const productPrice = tripProduct.product.priceUnite;
    const qttVendu = tripProduct.qttVendu;
    const capacity = tripProduct.product.capacityByBox;
    waitedAmount += productPrice * capacity * qttVendu;
  });
  // set tripinformation
  trip.waitedAmount = waitedAmount;
  trip.receivedAmount = receivedAmount;
  trip.benefit = waitedAmount - receivedAmount;
  trip.isActive = false;
  trip.save();
  // Send the response
  res.status(StatusCodes.OK).json({
    message: "Trip finished successfully",
    trip,
    tripWastes: tripWastesData,
    tripCharges: tripChargesData,
  });
};

// get Rest in the last truck
const getRestInLastTruck = async (req, res) => {
  const { id: truck_matricule } = req.params;
  const trip = await db.Trip.findOne({
    where: { truck_matricule, isActive: false },
    order: [["date", "DESC"]],
  });
  if (!trip) {
    throw new CustomError.NotFoundError(
      `Trip with truck matricule ${truck_matricule} not found`
    );
  }
  // get trip products
  const tripProducts = await db.TripProduct.findAll({
    where: { trip: trip.id },
    include: [
      {
        model: db.Product,
        as: "ProductAssociation",
        attributes: ["designation"],
      },
    ],
    attributes: ["product", "qttReutour"],
  });
  // get trip boxes
  const tripBoxes = await db.TripBox.findAll({
    where: { trip: trip.id },
    include: [
      {
        model: db.Box,
        as: "BoxAssociation",
        attributes: ["designation"],
      },
    ],
    attributes: ["box", "qttIn"],
  });
  res.status(StatusCodes.OK).json({
    trip,
    tripProducts,
    tripBoxes,
    tripBoxes,
  });
};

const getTrips = async (req, res) => {
  const trips = await db.Trip.findAll({
    include: [
      {
        model: db.Truck,
        as: "TruckAssociation",
        attributes: ["matricule"],
      },
      {
        model: db.Employee,
        as: "DriverAssociation",
        attributes: ["name"],
      },
      {
        model: db.Employee,
        as: "SellerAssociation",
        attributes: ["name"],
      },
    ],
  });

  res.status(StatusCodes.OK).json({ trips });
};

const getTripById = async (req, res) => {
  const { id: tripId } = req.params;
  const trip = await db.Trip.findOne({
    where: { id: tripId },
    include: [
      {
        model: db.Truck,
        as: "TruckAssociation",
        attributes: ["matricule"],
      },
      {
        model: db.Employee,
        as: "DriverAssociation",
        attributes: ["name"],
      },
      {
        model: db.Employee,
        as: "SellerAssociation",
        attributes: ["name"],
      },
    ],
  });
  if (!trip) {
    throw new CustomError.NotFoundError(`Trip with id ${tripId} not found`);
  }
  // get Trip products
  const tripProducts = await db.TripProduct.findAll({
    where: { trip: trip.id },
    include: [
      {
        model: db.Product,
        as: "ProductAssociation",
        attributes: ["designation"],
      },
    ],
    attributes: ["product", "qttReutour", "qttVendu", "qttOut"],
  });
  // get trip boxes
  const tripBoxes = await db.TripBox.findAll({
    where: { trip: trip.id },
    include: [
      {
        model: db.Box,
        as: "BoxAssociation",
        attributes: ["designation"],
      },
    ],
    attributes: ["box", "qttIn", "qttOut"],
  });
  // get trip wastes
  const tripWastes = await db.TripWaste.findAll({
    where: { trip: trip.id },
  });
  // get trip charges
  const tripCharges = await db.TripCharges.findAll({
    where: { trip: trip.id },
  });
  res
    .status(StatusCodes.OK)
    .json({ trip, tripProducts, tripBoxes, tripWastes, tripCharges });
};

module.exports = {
  startTrip,
  finishTrip,
  getRestInLastTruck,
  getTrips,
  getTripById,
};
