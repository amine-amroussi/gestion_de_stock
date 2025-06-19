const router = require('express').Router();
const { createCharge, getAllCharges, getChargeById, getCharges, updateCharge } = require('../controller/chargeController');

router.route('/').post(createCharge).get(getAllCharges);
router.route('/all').get(getCharges);
router.route('/:id').get(getChargeById);
router.route('/:id/update').post(updateCharge);

module.exports = router;