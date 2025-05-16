const router = require('express').Router();
const {
    createEmployee,
    getAllEmployees,
    getEmployeeById,
    updateEmployee,
    deleteEmployee} = require('../controller/employeeController');

router.route('/').post(createEmployee).get(getAllEmployees);
router.route('/:id').get(getEmployeeById).patch(updateEmployee).delete(deleteEmployee);

module.exports = router; 