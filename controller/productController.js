const db = require("../models");
const CustomError = require("../errors");
const { StatusCodes } = require("http-status-codes");
const { Op } = require("sequelize");

const createProduct = async (req, res) => {
  const { designation, genre, priceUnite, capacityByBox, box } = req.body;

  if (!designation || !genre) {
    throw new CustomError.BadRequestError("Veuillez fournir tous les champs : designation et genre sont requis.");
  }

  if (priceUnite !== undefined && (isNaN(parseFloat(priceUnite)) || parseFloat(priceUnite) < 0)) {
    throw new CustomError.BadRequestError("Le prix unitaire doit être un nombre positif.");
  }

  if (capacityByBox !== undefined && (isNaN(parseInt(capacityByBox)) || parseInt(capacityByBox) < 0)) {
    throw new CustomError.BadRequestError("La capacité par crate doit être un nombre positif.");
  }

  if (box) {
    const boxExists = await db.Box.findOne({ where: { id: box } });
    if (!boxExists) {
      throw new CustomError.BadRequestError(`Aucun crate trouvé avec l'ID : ${box}`);
    }
  }

  const existingProduct = await db.Product.findOne({ where: { designation } });
  if (existingProduct) {
    throw new CustomError.BadRequestError("Un produit avec cette désignation existe déjà.");
  }

  const product = await db.Product.create({
    designation,
    genre,
    priceUnite: priceUnite !== undefined ? parseFloat(priceUnite) : 0,
    capacityByBox: capacityByBox !== undefined ? parseInt(capacityByBox) : 0,
    box: box || null,
    stock: 0,
    uniteInStock: 0,
  });

  res.status(StatusCodes.CREATED).json({
    msg: "Produit créé avec succès.",
    data: { product },
  });
};

const getAllProducts = async (req, res) => {
  // Extract pagination and filter parameters from query string
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const { search, minPrice, maxPrice } = req.query;

  console.log("Received query params:", { page, limit, search, minPrice, maxPrice });

  // Build where clause for filtering
  const where = {};
  if (search) {
    where.designation = { [Op.like]: `%${search}%` }; // Use Op.like for MySQL
  }
  if (minPrice && !isNaN(parseFloat(minPrice))) {
    where.priceUnite = { ...where.priceUnite, [Op.gte]: parseFloat(minPrice) };
  }
  if (maxPrice && !isNaN(parseFloat(maxPrice))) {
    where.priceUnite = { ...where.priceUnite, [Op.lte]: parseFloat(maxPrice) };
  }

  console.log("Sequelize where clause:", where);

  try {
    // Fetch products with pagination, filters, and include total count
    const { count, rows: products } = await db.Product.findAndCountAll({
      where,
      include: [
        {
          model: db.Box,
          as: "BoxAssociation",
          attributes: ["id", "designation"],
        },
      ],
      order: [["id", "ASC"]],
      limit,
      offset,
    });

    console.log("Found products:", products.length, "Total count:", count);

    if (!products || products.length === 0) {
      return res.status(StatusCodes.OK).json({
        msg: "Aucun produit trouvé.",
        data: {
          products: [],
          pagination: {
            totalItems: 0,
            totalPages: 0,
            currentPage: page,
            pageSize: limit,
          },
        },
      });
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil(count / limit);

    // Return paginated response
    res.status(StatusCodes.OK).json({
      msg: "Produits récupérés avec succès.",
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
  } catch (error) {
    console.error("Database error:", error);
    throw new CustomError.InternalServerError("Une erreur de base de données est survenue. Veuillez réessayer plus tard.");
  }
};

const getProductById = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(id)) {
    throw new CustomError.BadRequestError("L'ID du produit doit être un nombre valide.");
  }

  const product = await db.Product.findOne({
    where: { id },
    include: [
      {
        model: db.Box,
        as: "BoxAssociation",
        attributes: ["id", "designation"],
      },
    ],
  });

  if (!product) {
    throw new CustomError.NotFoundError(`Aucun produit trouvé avec l'ID : ${id}`);
  }

  res.status(StatusCodes.OK).json({
    msg: "Produit récupéré avec succès.",
    data: { product },
  });
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { designation, genre, priceUnite, capacityByBox, box } = req.body;

  if (!id || isNaN(id)) {
    throw new CustomError.BadRequestError("L'ID du produit doit être un nombre valide.");
  }

  if (!designation || !genre) {
    throw new CustomError.BadRequestError("Veuillez fournir tous les champs : designation et genre sont requis.");
  }

  if (priceUnite !== undefined && (isNaN(parseFloat(priceUnite)) || parseFloat(priceUnite) < 0)) {
    throw new CustomError.BadRequestError("Le prix unitaire doit être un nombre positif.");
  }

  if (capacityByBox !== undefined && (isNaN(parseInt(capacityByBox)) || parseInt(capacityByBox) < 0)) {
    throw new CustomError.BadRequestError("La capacité par crate doit être un nombre positif.");
  }

  if (box) {
    const boxExists = await db.Box.findOne({ where: { id: box } });
    if (!boxExists) {
      throw new CustomError.BadRequestError(`Aucun crate trouvé avec l'ID : ${box}`);
    }
  }

  const existingProduct = await db.Product.findOne({ where: { id } });
  if (!existingProduct) {
    throw new CustomError.NotFoundError(`Aucun produit trouvé avec l'ID : ${id}`);
  }

  await db.Product.update(
    {
      designation,
      genre,
      priceUnite: priceUnite !== undefined ? parseFloat(priceUnite) : existingProduct.priceUnite,
      capacityByBox: capacityByBox !== undefined ? parseInt(capacityByBox) : existingProduct.capacityByBox,
      box: box !== undefined ? box : existingProduct.box,
    },
    { where: { id } }
  );

  const updatedProduct = await db.Product.findOne({
    where: { id },
    include: [
      {
        model: db.Box,
        as: "BoxAssociation",
        attributes: ["id", "designation"],
      },
    ],
  });

  res.status(StatusCodes.OK).json({
    msg: "Produit mis à jour avec succès.",
    data: { product: updatedProduct },
  });
};

const deleteProduct = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(id)) {
    throw new CustomError.BadRequestError("L'ID du produit doit être un nombre valide.");
  }

  const product = await db.Product.findOne({ where: { id } });
  if (!product) {
    throw new CustomError.NotFoundError(`Aucun produit trouvé avec l'ID : ${id}`);
  }

  try {
    await db.Product.destroy({ where: { id } });
    res.status(StatusCodes.OK).json({
      msg: "Produit supprimé avec succès.",
      data: null,
    });
  } catch (error) {
    if (error.name === "SequelizeForeignKeyConstraintError") {
      throw new CustomError.BadRequestError(
        "Impossible de supprimer le produit : il est utilisé dans des voyages, déchets ou achats."
      );
    }
    throw new CustomError.BadRequestError("Erreur lors de la suppression du produit.");
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};