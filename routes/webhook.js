const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Endpoint webhook
router.post('/', webhookController.handleWebhook);

module.exports = router;