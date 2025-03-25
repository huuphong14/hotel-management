const crypto = require('crypto');
const axios = require('axios');
const Payment = require('../models/Payment');
const config = require('../config/config');

class PaymentService {
  constructor() {
    this.config = {
      appid: process.env.ZALOPAY_APPID,
      key1: process.env.ZALOPAY_KEY1,
      key2: process.env.ZALOPAY_KEY2,
      endpoint: process.env.ZALOPAY_ENDPOINT
    };
  }

  // Tạo chữ ký cho ZaloPay
  createZaloPaySignature(data) {
    const message = `${this.config.appid}|${data.apptransid}|${data.appuser}|${data.amount}|${data.apptime}|${data.embeddata}|${data.item}`;
    return crypto.createHmac('sha256', this.config.key1)
      .update(message)
      .digest('hex');
  }

  // Tạo đơn thanh toán ZaloPay
  async createZaloPayOrder(booking) {
    try {
      const apptransid = `${Date.now()}_${booking._id}`;
      const apptime = Date.now();
      const embeddata = JSON.stringify({
        bookingId: booking._id.toString(),
        redirecturl: `${config.clientUrl}/booking-result`
      });
      const item = JSON.stringify([{
        itemid: booking.room._id,
        itemname: `Room Booking: ${booking.room.name}`,
        itemprice: booking.finalPrice,
        itemquantity: 1
      }]);

      const order = {
        appid: this.config.appid,
        apptransid,
        appuser: booking.user._id,
        apptime,
        amount: booking.finalPrice,
        description: `Room Booking Payment - ${booking._id}`,
        embeddata,
        item,
        bankcode: "zalopayapp"
      };

      order.mac = this.createZaloPaySignature(order);

      const response = await axios.post(
        `${this.config.endpoint}/create`,
        order
      );

      if (response.data.returncode === 1) {
        // Tạo payment record
        const payment = await Payment.create({
          bookingId: booking._id,
          amount: booking.finalPrice,
          paymentMethod: 'zalopay',
          transactionId: apptransid,
          metadata: {
            ordertoken: response.data.ordertoken,
            zptransid: response.data.zptransid
          }
        });

        return {
          success: true,
          paymentId: payment._id,
          payUrl: response.data.orderurl
        };
      }

      throw new Error(response.data.returnmessage);
    } catch (error) {
      throw new Error(`ZaloPay payment creation failed: ${error.message}`);
    }
  }

  // Xử lý callback từ ZaloPay
  async handleZaloPayCallback(data) {
    try {
      // Verify callback signature
      const validSignature = this.verifyZaloPayCallback(data);
      if (!validSignature) {
        throw new Error('Invalid callback signature');
      }

      const payment = await Payment.findOne({
        transactionId: data.apptransid
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Cập nhật trạng thái payment
      payment.status = data.status === 1 ? 'completed' : 'failed';
      payment.metadata.zptransid = data.zptransid;
      await payment.save();

      // Cập nhật trạng thái booking
      const booking = await Booking.findById(payment.bookingId);
      if (booking) {
        booking.status = payment.status === 'completed' ? 'confirmed' : 'pending';
        await booking.save();
      }

      return { success: true };
    } catch (error) {
      throw new Error(`ZaloPay callback processing failed: ${error.message}`);
    }
  }

  // Xử lý hoàn tiền
  async processRefund(booking, reason) {
    try {
      const payment = await Payment.findOne({
        bookingId: booking._id,
        status: 'completed'
      });

      if (!payment) {
        throw new Error('No completed payment found for this booking');
      }

      // Tính số tiền hoàn trả dựa trên chính sách
      const refundAmount = this.calculateRefundAmount(booking);

      if (refundAmount <= 0) {
        throw new Error('No refund amount available');
      }

      // Gọi API hoàn tiền của ZaloPay
      const refundData = {
        appid: this.config.appid,
        zptransid: payment.metadata.zptransid,
        amount: refundAmount,
        description: `Refund for booking ${booking._id}: ${reason}`
      };

      refundData.mac = this.createRefundSignature(refundData);

      const response = await axios.post(
        `${this.config.endpoint}/refund`,
        refundData
      );

      if (response.data.returncode === 1) {
        // Tạo payment record cho refund
        await Payment.create({
          bookingId: booking._id,
          amount: refundAmount,
          paymentMethod: 'refund',
          status: 'completed',
          transactionId: `RF_${Date.now()}`,
          refundReason: reason,
          metadata: {
            originalPaymentId: payment._id,
            refundTransactionId: response.data.refundtransid
          }
        });

        // Cập nhật booking status
        booking.status = 'cancelled';
        await booking.save();

        return {
          success: true,
          refundAmount,
          message: 'Refund processed successfully'
        };
      }

      throw new Error(response.data.returnmessage);
    } catch (error) {
      throw new Error(`Refund processing failed: ${error.message}`);
    }
  }

  // Tính số tiền hoàn trả
  calculateRefundAmount(booking) {
    const now = new Date();
    const checkIn = new Date(booking.checkIn);
    const hoursDiff = (checkIn - now) / (1000 * 60 * 60);

    // Chính sách hoàn tiền:
    // - Hủy trước 72h: hoàn 100%
    // - Hủy trước 48h: hoàn 70%
    // - Hủy trước 24h: hoàn 50%
    // - Hủy trong 24h: không hoàn tiền
    if (hoursDiff >= 72) {
      return booking.finalPrice;
    } else if (hoursDiff >= 48) {
      return booking.finalPrice * 0.7;
    } else if (hoursDiff >= 24) {
      return booking.finalPrice * 0.5;
    }
    return 0;
  }
}

module.exports = new PaymentService(); 