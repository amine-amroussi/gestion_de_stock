const db = require("../models");
const CustumError = require("../errors");
const { StatusCodes } = require("http-status-codes");

const createProduct = async (req, res) => {
  const { designation, priceUnite, genre } = req.body;
  // Validate the input
  if (!designation || !priceUnite || !genre) {
    throw new CustumError.BadRequestError("Please provide all values");
  }
  // Check if the product already exists
  const existingProduct = await db.Product.findOne({ where: { designation } });
  if (existingProduct) {
    throw new CustumError.BadRequestError("Product already exists");
  }
  // Create the product
  const product = await db.Product.create({
    ...req.body,
  });
  // Send the response
  res.status(StatusCodes.CREATED).json({
    status: "success",
    data: {
      product,
    },
  });
};

const getAllProducts = async (req, res) => {
  // Extract pagination parameters from query string
  const page = parseInt(req.query.page) || 1; // Default to page 1
  const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page
  const offset = (page - 1) * limit; // Calculate offset

  // Fetch products with pagination and include total count
  const { count, rows: products } = await db.Product.findAndCountAll({
    include: [
      {
        model: db.Box,
        as: "BoxAssociation",
        attributes: ["id", "designation"],
      },
    ],
    order: [["id", "ASC"]],
    limit, // Number of records per page
    offset, // Starting point
  });

  // Calculate pagination metadata
  const totalPages = Math.ceil(count / limit);

  // Return paginated response
  res.status(StatusCodes.OK).json({
    status: "success",
    data: {
      products,
      pagination: {
        totalItems: count,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    },
  });
};
const getProductById = async (req, res) => {

  const { id } = req.params;  
  const product = await db.Product.findOne({
    where: { id },
    include: [
      {
        model: db.Box,
        as: "BoxAssociation",
        attributes: ["id", "designation", ],
      },
    ],
  });
  if (!product) {
    throw new CustumError.NotFoundError(`No product with id : ${id}`);
  }
  res.status(StatusCodes.OK).json({
    status: "success",
    data: {
      product,
    },
  });
};

const updateProduct = async (req, res) => {
const { id } = req.params;

const { designation, priceUnite, genre } = req.body;
// Validate the input
if (!designation || !priceUnite || !genre) {
  throw new CustumError.BadRequestError("Please provide all values");
}
// Check if the product already exists
// const existingProduct = await db.Product.findOne({ where: { designation } });
// if (existingProduct && existingProduct.id !== id) {
//   throw new CustumError.BadRequestError("Product not exists");
// }
// Update the product
const product = await db.Product.update
  (
    {
      ...req.body,
    },
    {
      where: { id },
    }
  );
  if (!product) {
    throw new CustumError.NotFoundError(`No product with id : ${id}`);
  }
  // Send the response
  res.status(StatusCodes.OK).json({
    status: "success",
    data: {
      product,
    },
  });

};

const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const product = await db.Product.destroy({
    where: { id },
  });
  if (!product) {
    throw new CustumError.NotFoundError(`No product with id : ${id}`);
  }
  res.status(StatusCodes.OK).json({
    status: "success",
    data: null,
  });
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
