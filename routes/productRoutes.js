const router = require("express").Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controller/productController");

router.route("/").get(getAllProducts).post(createProduct);
router
  .route("/:id")
  .get(getProductById)
  .patch(updateProduct)
  .delete(deleteProduct);

module.exports = router;
