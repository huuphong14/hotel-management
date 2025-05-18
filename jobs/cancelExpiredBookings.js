const Booking = require('../models/Booking');
const NotificationService = require('../services/notificationService');

async function cancelExpiredBookings() {
  console.log('Running job to cancel expired bookings');
  const now = new Date();
  const AUTO_CANCEL_HOURS = 24;

  try {
    const expiredBookings = await Booking.find({
      status: 'pending',
      retryCount: { $gt: 0 },
      lastRetryAt: { $lt: new Date(now - AUTO_CANCEL_HOURS * 60 * 60 * 1000) }
    });

    for (const booking of expiredBookings) {
      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      booking.cancellationReason = 'payment_timeout';
      await booking.save();

      await NotificationService.createNotification({
        user: booking.user,
        title: 'Booking Cancelled',
        message: `Booking #${booking._id} has been cancelled due to payment timeout`,
        type: 'booking',
        relatedModel: 'Booking',
        relatedId: booking._id
      });
      console.log(`Auto-cancelled booking ${booking._id}`);
    }
  } catch (error) {
    console.error('Error in cancelExpiredBookings job:', error);
  }
}

module.exports = cancelExpiredBookings;