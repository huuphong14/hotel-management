const bookingRoutes = require('./routes/bookingRoutes');

// Mount booking routes
app.use('/api/bookings', bookingRoutes);

// Mount hotel booking routes
app.use('/api/hotels/:hotelId/bookings', bookingRoutes);

// ... các route khác 