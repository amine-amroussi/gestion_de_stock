const router = require('express').Router();
const {createWaste, getAllWastes , getWasteById} = require('../controller/wasteController')

router.route('/').post(createWaste).get(getAllWastes)
router.route('/:id').get(getWasteById)

module.exports = router;