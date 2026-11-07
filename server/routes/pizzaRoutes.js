const express = require('express');
const router = express.Router();
const { getPizzas, getPizzaById } = require('../controllers/pizzaController');

router.get('/', getPizzas);
router.get('/:id', getPizzaById);

module.exports = router;
