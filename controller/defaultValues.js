const db = require("../models"); // Assuming you have a models/index.js that exports your models
const getDefaultValues = async (req, res) => {
  //Count all products
  const productCount = await db.Product.count();
  // calculate the total number of products
  const products = await db.Product.findAll({
    attributes: [
      "id",
      "designation",
      "priceUnite",
      "capacityByBox",
      "stock",
      "uniteInStock",
    ],
    order: [["id", "ASC"]],
  });
  products.forEach((product) => {
    product.dataValues.priceUnite = parseFloat(product.dataValues.priceUnite);
    product.dataValues.capacityByBox = parseInt(
      product.dataValues.capacityByBox
    );
    product.dataValues.stock = parseInt(product.dataValues.stock);
    product.dataValues.uniteInStock = parseInt(product.dataValues.uniteInStock);
  });

  const totalPrice = products.reduce(
    (acc, product) =>
      acc +
      product.dataValues.priceUnite *
        (product.dataValues.uniteInStock +
          product.dataValues.stock * product.dataValues.capacityByBox),
    0
  );
  // Number of the boxes
  const boxCount = await db.Box.count();
  // number of the trucks
  const truckCount = await db.Truck.count();
  // number of the employees
  const employeeCount = await db.Employee.count();
  // number of the suppliers
  const supplierCount = await db.Supplier.count();

  // count  active trips
  const activeTrips = await db.Trip.count({
    where: {
      isActive: true,
    },
  });

  // count empty boxes
  const boxes = await db.Box.findAll({});

  const emptyBoxes = boxes.reduce((acc, box) => acc + box.dataValues.empty, 0);
  const inStockBoxes = boxes.reduce(
    (acc, box) => acc + box.dataValues.inStock, 0
  );
  const sentBoxes = boxes.reduce(
    (acc, box) => acc + box.dataValues.sent, 0
  );

  res
    .status(200)
    .json({
      productCount,
      totalPrice,
      boxCount,
      truckCount,
      employeeCount,
      supplierCount,
      activeTrips,
      emptyBoxes,
      sentBoxes,
        inStockBoxes,
    });
};

module.exports = {
  getDefaultValues,
};
