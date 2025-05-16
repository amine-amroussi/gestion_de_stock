const router = require('express').Router();
const {
  createSupplier,
    getAllSuppliers,
    getSupplierById,
    updateSupplier
} = require('../controller/supplierController');

router.route('/').post(createSupplier).get(getAllSuppliers);
router.route('/:id').get(getSupplierById).patch(updateSupplier);

module.exports = router;