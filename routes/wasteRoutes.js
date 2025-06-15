const router = require('express').Router();
const {createWaste, getAllWastes , getWasteById, getWastes, sendToSupplier} = require('../controller/wasteController')

router.route('/').post(createWaste).get(getAllWastes)
router.route('/all').get(getWastes)
router.route('/:id').get(getWasteById)
router.route('/:id/send-supplier').post(sendToSupplier);

module.exports = router;