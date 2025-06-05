const express = require('express');
const router = express.Router();
const {searchHotels} = require('../controllers/webhookController');


// Route cho webhook tìm kiếm khách sạn
router.post('/search-hotels', searchHotels);

module.exports = router;