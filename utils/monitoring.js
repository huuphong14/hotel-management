const { Counter } = require('prom-client');

const retryPaymentFailures = new Counter({
  name: 'retry_payment_failures_total',
  help: 'Total number of failed retry payment attempts',
  labelNames: ['bookingId', 'paymentMethod']
});

async function recordRetryFailure(bookingId, paymentMethod, error) {
  retryPaymentFailures.inc({ bookingId, paymentMethod });
  const Payment = require('../models/Payment');
  const failedCount = await Payment.countDocuments({ bookingId, status: 'failed' });
  if (failedCount >= 3) {
    console.warn(`Critical: Booking ${bookingId} has ${failedCount} failed payment attempts`);
    // TODO: Gửi cảnh báo qua email hoặc Slack
  }
}

module.exports = { recordRetryFailure };