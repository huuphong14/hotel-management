const axios = require('axios');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const moment = require('moment');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const NotificationService = require('../services/notificationService');
const sendEmail = require('../utils/sendEmail');
const { getInvoiceTemplate } = require('../utils/invoiceTemplate');
const { generatePDF } = require('../utils/generatePDF');

class ZaloPayService {
  static config = {
    appId: process.env.ZALOPAY_APP_ID,
    key1: process.env.ZALOPAY_KEY1,
    key2: process.env.ZALOPAY_KEY2,
    endpoint: process.env.ZALOPAY_ENDPOINT,
    returnUrl: process.env.ZALOPAY_RETURN_URL,
    cancelUrl: process.env.ZALOPAY_CANCEL_URL,
    callbackUrl: process.env.ZALOPAY_CALLBACK_URL
  };

  static generateTransactionId() {
    const datePrefix = moment().utcOffset('+07:00').format('YYMMDD');
    const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `${datePrefix}_${randomNum}`;
  }

  static createSignature(data) {
    const signData = [
      data.app_id,
      data.app_trans_id,
      data.app_user,
      data.amount,
      data.app_time,
      data.embed_data,
      data.item
    ].join('|');
    return crypto
      .createHmac('sha256', this.config.key1)
      .update(signData)
      .digest('hex');
  }

  static verifyCallbackSignature(data, mac) {
    const dataStr = Object.keys(data)
      .filter(key => key !== 'mac')
      .sort()
      .map(key => `${key}=${data[key]}`)
      .join('&');

    const signature = crypto
      .createHmac('sha256', this.config.key2)
      .update(dataStr)
      .digest('hex');

    return signature === mac;
  }

  static async createPaymentUrl(booking) {
    console.log("Creating payment URL for booking:", booking._id);
    const transactionId = this.generateTransactionId();
    const amount = Math.round(booking.finalPrice);

    // Làm sạch các giao dịch cũ
    await Payment.updateMany(
      { bookingId: booking._id, status: { $in: ['pending', 'failed'] } },
      { status: 'cancelled' }
    );
    console.log(`Cancelled existing pending/failed payments for booking ${booking._id}`);

    const existingPayment = await Payment.findOne({
      bookingId: booking._id,
      status: 'cancelled'
    });

    if (existingPayment) {
      console.log(`Found existing payment ${existingPayment.transactionId}, updating...`);
      existingPayment.transactionId = transactionId;
      existingPayment.status = 'pending';
      existingPayment.createdAt = new Date();
      await existingPayment.save();
    }

    const orderData = {
      app_id: Number(this.config.appId),
      app_user: booking.user._id ? booking.user._id.toString() : booking.user.toString(),
      app_trans_id: transactionId,
      app_time: Date.now(),
      item: JSON.stringify([{
        itemid: booking.room._id ? booking.room._id.toString() : booking.room.toString(),
        itemname: 'Room Booking',
        itemprice: amount,
        itemquantity: 1
      }]),
      embed_data: JSON.stringify({
        bookingId: booking._id.toString(),
        redirecturl: this.config.returnUrl
      }),
      amount: amount,
      description: `Payment for Booking ${booking._id}`,
      bank_code: 'zalopayapp',
      callback_url: this.config.callbackUrl
    };

    const signature = this.createSignature(orderData);
    orderData.mac = signature;

    try {
      console.log("Sending request to ZaloPay with data:", orderData);
      const response = await axios.post(
        `${this.config.endpoint}/create`,
        null,
        {
          params: orderData,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log("ZaloPay response:", response.data);

      if (!existingPayment) {
        await Payment.create({
          bookingId: booking._id,
          amount: amount,
          paymentMethod: 'zalopay',
          status: 'pending',
          transactionId: transactionId
        });
      }

      return {
        payUrl: response.data.order_url,
        transactionId: transactionId
      };
    } catch (error) {
      console.error('ZaloPay payment URL creation error:', error.response?.data || error.message);
      throw new Error(`Không thể tạo liên kết thanh toán: ${error.response?.data?.return_message || error.message}`);
    }
  }

  static async refundPayment(booking) {
    console.log(`=== STARTING REFUND PROCESS FOR BOOKING ${booking._id} ===`);

    if (!['confirmed', 'pending'].includes(booking.status)) {
      console.error(`Không thể hoàn tiền cho booking ${booking._id} với trạng thái ${booking.status}`);
      throw new Error('Booking không ở trạng thái có thể hoàn tiền');
    }

    console.log(`Tìm giao dịch thanh toán cho booking ${booking._id}`);
    const payment = await Payment.findOne({
      bookingId: booking._id,
      status: 'completed'
    });

    if (!payment) {
      console.error(`Không tìm thấy giao dịch thanh toán hoàn tất cho booking ${booking._id}`);
      throw new Error('Không tìm thấy giao dịch thanh toán');
    }

    if (payment.status === 'refunded') {
      console.warn(`Booking ${booking._id} đã được hoàn tiền trước đó`);
      throw new Error('Giao dịch này đã được hoàn tiền');
    }

    console.log(`Giao dịch thanh toán tìm thấy: ${payment.transactionId}`);

    let zpTransId = payment.zpTransId;

    if (!zpTransId) {
      console.log(`Không tìm thấy zpTransId, tiến hành truy vấn từ ZaloPay`);
      try {
        const verifyResult = await this.verifyPayment(payment.transactionId);

        if (verifyResult.return_code === 1 && verifyResult.zp_trans_id) {
          zpTransId = verifyResult.zp_trans_id;
          payment.zpTransId = zpTransId;
          await payment.save();
          console.log(`Đã lấy và lưu zpTransId: ${zpTransId}`);
        } else {
          console.error(`Không thể lấy mã giao dịch ZaloPay, mã lỗi: ${verifyResult.return_code}`);
          throw new Error('Không thể lấy mã giao dịch ZaloPay');
        }
      } catch (error) {
        console.error('Lỗi khi truy vấn ZaloPay:', error.message);
        throw new Error('Không thể truy vấn thông tin giao dịch ZaloPay');
      }
    }

    console.log(`Sử dụng zpTransId: ${zpTransId} cho yêu cầu hoàn tiền`);

    const timestamp = Date.now();
    const uid = `${timestamp}${Math.floor(111 + Math.random() * 999)}`;
    const mRefundId = `${moment().format('YYMMDD')}_${this.config.appId}_${uid}`;
    console.log(`Tạo m_refund_id: ${mRefundId}`);

    const refundData = {
      app_id: this.config.appId,
      m_refund_id: mRefundId,
      zp_trans_id: zpTransId,
      amount: payment.amount,
      timestamp: timestamp,
      description: `Refund for Booking ${booking._id}`
    };

    console.log("Kiểm tra thông tin request:");
    console.log(`- app_id: ${refundData.app_id}`);
    console.log(`- m_refund_id: ${refundData.m_refund_id}`);
    console.log(`- zp_trans_id: ${refundData.zp_trans_id}`);
    console.log(`- amount: ${refundData.amount}`);
    console.log(`- timestamp: ${refundData.timestamp}`);
    console.log(`- description: ${refundData.description}`);

    const dataStr = refundData.app_id + "|" + refundData.zp_trans_id + "|" +
      refundData.amount + "|" + refundData.description + "|" + refundData.timestamp;

    console.log(`Chuỗi dữ liệu chữ ký: ${dataStr}`);

    refundData.mac = CryptoJS.HmacSHA256(dataStr, this.config.key1).toString();
    console.log(`Chữ ký được tạo: ${refundData.mac}`);

    try {
      console.log(`Gửi yêu cầu hoàn tiền đến ZaloPay API: ${this.config.endpoint}/refund`);
      const response = await axios.post(
        `${this.config.endpoint}/refund`,
        null,
        {
          params: refundData,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log(`Phản hồi từ ZaloPay: ${JSON.stringify(response.data, null, 2)}`);

      const { return_code, return_message, refund_id } = response.data;

      if (return_code === 1) {
        console.log(`Hoàn tiền thành công cho booking ${booking._id}`);

        payment.status = 'refunded';
        payment.refundTransactionId = mRefundId;
        payment.zaloRefundId = refund_id;
        payment.refundTimestamp = new Date();
        payment.refundAmount = payment.amount;
        await payment.save();
        console.log(`Đã cập nhật trạng thái thanh toán thành 'refunded'`);

        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        booking.cancellationReason = 'user_requested';
        await booking.save();
        console.log(`Đã cập nhật trạng thái booking thành 'cancelled'`);

        await this.sendRefundNotification(booking, payment);
        console.log(`Đã gửi thông báo hoàn tiền`);

        return true;
      } else if (return_code === 2) {
        console.error(`Hoàn tiền thất bại: ${return_message}`);
        payment.status = 'refund_failed';
        payment.refundFailReason = return_message;
        await payment.save();
        throw new Error(`Hoàn tiền thất bại: ${return_message}`);
      } else if (return_code === 3) {
        console.log(`Giao dịch hoàn tiền đang xử lý, cần kiểm tra lại sau`);
        payment.refundTransactionId = mRefundId;
        payment.zaloRefundId = refund_id;
        payment.status = 'refunding';
        await payment.save();

        setTimeout(async () => {
          await this.checkRefundStatus(mRefundId, booking, payment);
        }, 60000);

        return 'processing';
      } else {
        console.error(`Lỗi không xác định: ${return_code} - ${return_message}`);
        throw new Error(`Lỗi hoàn tiền: ${return_message}`);
      }
    } catch (error) {
      console.error('ZaloPay refund error:', error.response?.data || error.message);
      console.error('Error stack:', error.stack);
      throw new Error('Không thể thực hiện hoàn tiền: ' + (error.response?.data?.return_message || error.message));
    } finally {
      console.log(`=== KẾT THÚC QUÁ TRÌNH HOÀN TIỀN CHO BOOKING ${booking._id} ===`);
    }
  }

  static async checkRefundStatus(refundTransId, booking, payment) {
    console.log(`=== CHECKING REFUND STATUS FOR ${refundTransId} ===`);
    try {
      const timestamp = Date.now();
      const queryData = {
        app_id: this.config.appId,
        m_refund_id: refundTransId,
        timestamp: timestamp
      };

      const dataStr = `${queryData.app_id}|${queryData.m_refund_id}|${queryData.timestamp}`;
      console.log('Query signature data string:', dataStr);
      queryData.mac = crypto
        .createHmac('sha256', this.config.key1)
        .update(dataStr)
        .digest('hex');
      console.log('Query signature:', queryData.mac);

      console.log(`Sending status query to: ${this.config.endpoint}/query_refund`);
      console.log('Query params:', JSON.stringify(queryData, null, 2));
      const response = await axios.post(`${this.config.endpoint}/query_refund`, null, {
        params: queryData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      console.log('Refund status response:', JSON.stringify(response.data, null, 2));

      if (response.data.return_code === 1) {
        console.log(`Refund completed successfully for ${refundTransId}`);
        payment.status = 'refunded';
        await payment.save();
        console.log('Updated payment to "refunded":', JSON.stringify(payment, null, 2));

        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        booking.cancellationReason = 'user_requested';
        await booking.save();
        console.log('Updated booking to "cancelled":', JSON.stringify(booking, null, 2));

        console.log('Sending refund notification');
        await this.sendRefundNotification(booking, payment);
        console.log('Refund notification sent successfully');
      } else if (response.data.return_code === 3) {
        console.log('Refund still processing, scheduling another check');
        setTimeout(async () => {
          console.log(`Rescheduling status check for ${refundTransId}`);
          await this.checkRefundStatus(refundTransId, booking, payment);
        }, 60000);
      } else {
        console.error(`Refund failed - Return code: ${response.data.return_code}`);
        console.error(`Return message: ${response.data.return_message}`);
        payment.status = 'refund_failed';
        payment.refundFailReason = response.data.return_message;
        await payment.save();
        console.log('Updated payment to "refund_failed":', JSON.stringify(payment, null, 2));
      }
    } catch (error) {
      console.error('=== REFUND STATUS CHECK ERROR ===');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      if (error.response) {
        console.error('ZaloPay error response:', JSON.stringify(error.response.data, null, 2));
      }
    } finally {
      console.log(`=== END REFUND STATUS CHECK FOR ${refundTransId} ===`);
    }
  }

  static async verifyPayment(transactionId) {
    try {
      console.log(`Verifying payment for transaction: ${transactionId}`);

      const data = {
        app_id: this.config.appId,
        app_trans_id: transactionId,
      };

      const dataString = `${data.app_id}|${data.app_trans_id}|${this.config.key1}`;
      const mac = crypto
        .createHmac('sha256', this.config.key1)
        .update(dataString)
        .digest('hex');

      console.log('Verification data:', JSON.stringify(data));
      console.log('Signature data string:', dataString);
      console.log('Generated MAC:', mac);

      data.mac = mac;

      console.log(`Sending verification request to ${this.config.endpoint}/query`);
      const response = await axios.post(`${this.config.endpoint}/query`, null, {
        params: data,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      console.log("ZaloPay verification response:", JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      console.error('Lỗi kiểm tra trạng thái thanh toán:', error.message);
      console.error('Response error:', error.response?.data);
      throw new Error('Không thể kiểm tra trạng thái thanh toán');
    }
  }

  static async handleCallback(req, res) {
    console.log('==== ZALOPAY CALLBACK STARTED ====');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers));

    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        console.error('ERROR: Empty callback data received');
        return res.status(400).json({
          return_code: -1,
          return_message: 'Empty data received'
        });
      }

      let callbackData = req.body;
      console.log('Received ZaloPay callback data:', JSON.stringify(callbackData, null, 2));

      if (callbackData.data && callbackData.mac && callbackData.type) {
        try {
          const dataString = callbackData.data;
          const receivedMac = callbackData.mac;

          const dataSignature = crypto
            .createHmac('sha256', this.config.key2)
            .update(dataString)
            .digest('hex');

          console.log('Data signature calculation:');
          console.log('- Data string:', dataString);
          console.log('- Calculated signature:', dataSignature);
          console.log('- Received signature:', receivedMac);

          if (dataSignature !== receivedMac) {
            console.error('ERROR: Invalid outer data signature');
            return res.status(400).json({
              return_code: -1,
              return_message: 'Invalid data signature'
            });
          }

          callbackData = JSON.parse(dataString);
          console.log('Parsed inner data:', JSON.stringify(callbackData, null, 2));
        } catch (parseError) {
          console.error('ERROR: Failed to parse data field:', parseError.message);
          return res.status(400).json({
            return_code: -1,
            return_message: 'Invalid data format'
          });
        }
      }

      const requiredFields = ['app_id', 'app_trans_id', 'amount', 'embed_data'];
      const missingFields = requiredFields.filter(field => !callbackData[field]);

      if (missingFields.length > 0) {
        console.error(`ERROR: Missing required fields: ${missingFields.join(', ')}`);
        return res.status(400).json({
          return_code: -1,
          return_message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      let bookingId;
      try {
        console.log('Parsing embed_data...');
        const embedData = typeof callbackData.embed_data === 'string' ?
          JSON.parse(callbackData.embed_data) : callbackData.embed_data;
        console.log('Parsed embed_data:', JSON.stringify(embedData));

        bookingId = embedData.bookingId;
        if (!bookingId) {
          throw new Error('bookingId not found in embed_data');
        }
        console.log('Extracted bookingId:', bookingId);
      } catch (parseError) {
        console.error('ERROR: Failed to parse embed_data:', parseError.message);
        console.error('Raw embed_data:', callbackData.embed_data);
        return res.json({
          return_code: -1,
          return_message: 'Invalid embed_data format'
        });
      }

      const { app_trans_id, amount, zp_trans_id } = callbackData;
      const trans_status = callbackData.trans_status || callbackData.status || 1;

      console.log('Finding payment record with transactionId:', app_trans_id);
      const payment = await Payment.findOne({ transactionId: app_trans_id });

      if (!payment) {
        console.error(`ERROR: Payment with transaction ID ${app_trans_id} not found`);
        return res.json({
          return_code: -1,
          return_message: 'Payment not found'
        });
      }

      console.log('Found payment record:', JSON.stringify(payment));

      console.log('Updating payment information...');
      payment.zpTransId = zp_trans_id;
      console.log(`Saved ZaloPay transaction ID (zpTransId): ${zp_trans_id}`);

      console.log('Transaction status from ZaloPay:', trans_status);

      if (trans_status === 1 || trans_status === '1') {
        console.log('Payment successful. Updating status to "completed"');
        payment.status = 'completed';
        await payment.save();
        console.log('Payment status updated successfully');

        console.log('Fetching booking with ID:', bookingId);
        const booking = await Booking.findById(bookingId)
          .populate([
            { path: 'room', select: 'name type price hotelId', populate: { path: 'hotelId', select: 'name address city' } },
            { path: 'user', select: 'name email' },
            { path: 'voucher', select: 'code discount discountType' }
          ]);

        if (booking) {
          console.log('Found booking:', JSON.stringify(booking));
          console.log('Updating booking status to "confirmed" and payment status to "paid"');

          booking.status = 'confirmed';
          booking.paymentStatus = 'paid';
          await booking.save();
          console.log('Booking updated successfully');

          console.log('Sending payment confirmation...');
          await this.sendPaymentConfirmation(booking, payment);
          console.log('Payment confirmation sent');
        } else {
          console.error(`ERROR: Booking with ID ${bookingId} not found`);
        }
      } else if (trans_status === 2 || trans_status === '2') {
        console.log('Payment failed. Updating status to "failed"');
        payment.status = 'failed';
        await payment.save();
        console.log('Payment status updated to "failed"');

        console.log('Fetching booking with ID:', bookingId);
        const booking = await Booking.findById(bookingId);

        if (booking) {
          console.log('Found booking:', JSON.stringify(booking));
          console.log('Updating booking payment status to "failed"');

          booking.paymentStatus = 'failed';
          await booking.save();
          console.log('Booking updated successfully');
        } else {
          console.error(`ERROR: Booking with ID ${bookingId} not found`);
        }
      } else {
        console.log(`Unhandled transaction status: ${trans_status}`);
      }

      console.log('Responding to ZaloPay with success');
      console.log('==== ZALOPAY CALLBACK COMPLETED ====');
      return res.json({ return_code: 1, return_message: 'Success' });
    } catch (error) {
      console.error('==== ZALOPAY CALLBACK ERROR ====');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('==== ZALOPAY CALLBACK ERROR END ====');

      return res.status(500).json({
        return_code: -1,
        return_message: `Server error: ${error.message}`
      });
    }
  }

  static async handleRedirect(req, res) {
    try {
      console.log("Nhận request từ cổng thanh toán:", req.query);

      const { status, apptransid, checksum } = req.query;

      if (checksum) {
        const dataStr = Object.keys(req.query)
          .filter(key => key !== 'checksum')
          .sort()
          .map(key => `${key}=${req.query[key]}`)
          .join('&');

        const calculatedChecksum = crypto
          .createHmac('sha256', this.config.key2)
          .update(dataStr)
          .digest('hex');

        console.log('Redirect checksum verification:');
        console.log('- Data string:', dataStr);
        console.log('- Calculated checksum:', calculatedChecksum);
        console.log('- Received checksum:', checksum);

        if (calculatedChecksum !== checksum) {
          console.warn("Invalid redirect checksum, but continuing with caution");
        }
      }

      if (status === '1') {
        console.log(`Giao dịch thành công, transactionId: ${apptransid}`);

        try {
          const verifyResult = await this.verifyPayment(apptransid);
          console.log("Kết quả xác minh từ ZaloPay:", verifyResult);

          if (verifyResult.return_code === 1 ||
            (verifyResult.return_code === 2 && verifyResult.status === 1)) {

            const payment = await Payment.findOne({ transactionId: apptransid });
            console.log("Thông tin thanh toán trước khi cập nhật:", payment);

            if (payment) {
              if (verifyResult.zp_trans_id && !payment.zpTransId) {
                payment.zpTransId = verifyResult.zp_trans_id;
                console.log(`Cập nhật zpTransId: ${verifyResult.zp_trans_id}`);
              }

              if (payment.status !== 'completed') {
                payment.status = 'completed';
                await payment.save();
                console.log("Đã cập nhật trạng thái thanh toán:", payment);

                const booking = await Booking.findById(payment.bookingId)
                  .populate([
                    { path: 'room', select: 'name type price hotelId', populate: { path: 'hotelId', select: 'name address city' } },
                    { path: 'user', select: 'name email' },
                    { path: 'voucher', select: 'code discount discountType' }
                  ]);

                console.log("Thông tin đặt phòng trước khi cập nhật:", booking);

                if (booking) {
                  booking.status = 'confirmed';
                  booking.paymentStatus = 'paid';
                  await booking.save();
                  console.log("Đã cập nhật trạng thái đặt phòng:", booking);

                  await this.sendPaymentConfirmation(booking, payment);
                  console.log("Đã gửi thông báo xác nhận thanh toán.");
                }
              } else {
                if (verifyResult.zp_trans_id && !payment.zpTransId) {
                  await payment.save();
                  console.log("Đã cập nhật zpTransId cho giao dịch đã hoàn tất.");
                }
              }

              console.log(`Chuyển hướng đến trang thành công: /booking-success/${payment.bookingId}`);
              return res.redirect(`/booking-success/${payment.bookingId}`);
            } else {
              console.error(`Payment with transaction ID ${apptransid} not found`);
              return res.redirect('/payment-failed?reason=transaction-not-found');
            }
          } else {
            console.log("Giao dịch thất bại theo xác minh từ ZaloPay");
            return res.redirect('/payment-failed?reason=verification-failed');
          }
        } catch (verifyError) {
          console.error("Lỗi xác minh giao dịch:", verifyError);
          const payment = await Payment.findOne({ transactionId: apptransid });

          if (payment && payment.status !== 'completed') {
            payment.status = 'completed';
            await payment.save();

            const booking = await Booking.findById(payment.bookingId)
              .populate([
                { path: 'room', select: 'name type price hotelId', populate: { path: 'hotelId', select: 'name address city' } },
                { path: 'user', select: 'name email' },
                { path: 'voucher', select: 'code discount discountType' }
              ]);

            if (booking) {
              booking.status = 'confirmed';
              booking.paymentStatus = 'paid';
              await booking.save();
            }

            await this.sendPaymentConfirmation(booking, payment);
            return res.redirect(`/booking-success/${payment.bookingId}`);
          }
        }
      }

      console.log("Giao dịch thất bại hoặc không xác minh được. Chuyển hướng đến /payment-failed");
      return res.redirect('/payment-failed');
    } catch (error) {
      console.error('Lỗi xử lý redirect:', error);
      return res.redirect('/payment-error');
    }
  }

  static async sendPaymentConfirmation(booking, payment) {
    try {
      // Ensure booking is populated with necessary data
      await booking.populate([
        { path: 'room', select: 'name type price hotelId', populate: { path: 'hotelId', select: 'name address city' } },
        { path: 'user', select: 'name email' },
        { path: 'voucher', select: 'code discount discountType' }
      ]);

      await NotificationService.createNotification({
        user: booking.user._id,
        title: 'Thanh toán thành công',
        message: `Bạn đã thanh toán thành công cho đơn đặt phòng #${booking._id}`,
        type: 'payment',
        relatedModel: 'Booking',
        relatedId: booking._id
      });

      // Tạo HTML hóa đơn
      const htmlContent = getInvoiceTemplate({
        _id: booking._id,
        room: booking.room,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        originalPrice: booking.originalPrice,
        discountAmount: booking.discountAmount,
        finalPrice: booking.finalPrice,
        paymentMethod: booking.paymentMethod,
        contactInfo: booking.contactInfo,
        guestInfo: booking.guestInfo,
        specialRequests: booking.specialRequests,
        bookingFor: booking.bookingFor,
        hotel: booking.room?.hotelId,
      });

      // Tạo PDF
      let pdfBuffer;
      try {
        pdfBuffer = await generatePDF(htmlContent);
      } catch (pdfError) {
        console.error('Lỗi khi tạo PDF hóa đơn:', pdfError.message);
      }

      const message = `
        <h1>Xác nhận thanh toán</h1>
        <p>Xin chào ${booking.user.name},</p>
        <p>Chúng tôi xác nhận đã nhận được thanh toán của bạn cho đơn đặt phòng.</p>
        <p>Thông tin thanh toán:</p>
        <ul>
          <li>Mã đơn: ${booking._id}</li>
          <li>Khách sạn: ${booking.room?.hotelId?.name || 'Không xác định'}</li>
          <li>Phòng: ${booking.room?.name || booking.room?.type || 'Không xác định'}</li>
          <li>Số tiền: ${payment.amount.toLocaleString('vi-VN')}đ</li>
          <li>Mã giao dịch: ${payment.transactionId}</li>
          <li>Trạng thái: Đã thanh toán</li>
        </ul>
        <p>Hóa đơn chi tiết đã được đính kèm dưới dạng PDF.</p>
        <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!</p>
      `;

      // Gửi email với PDF đính kèm
      try {
        await sendEmail({
          email: booking.user.email,
          subject: 'Xác nhận thanh toán thành công',
          message,
          attachments: pdfBuffer ? [
            {
              filename: `invoice-${booking._id}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ] : [],
        });
      } catch (emailError) {
        console.error('Lỗi gửi email xác nhận thanh toán:', emailError.message);
      }

    } catch (error) {
      console.error('Lỗi gửi thông báo xác nhận thanh toán:', error.message);
    }
  }

  static async sendRefundNotification(booking, payment) {
    try {
      await booking.populate([
        { path: 'room', select: 'name type price' },
        { path: 'user', select: 'name email' }
      ]);

      await NotificationService.createNotification({
        user: booking.user._id,
        title: 'Hoàn tiền thành công',
        message: `Đơn đặt phòng #${booking._id} đã được hoàn tiền thành công`,
        type: 'refund',
        relatedModel: 'Booking',
        relatedId: booking._id
      });

      const message = `
        <h1>Xác nhận hoàn tiền</h1>
        <p>Xin chào ${booking.user.name},</p>
        <p>Chúng tôi xác nhận đã hoàn tiền cho đơn đặt phòng của bạn.</p>
        <p>Thông tin hoàn tiền:</p>
        <ul>
          <li>Mã đơn: ${booking._id}</li>
          <li>Số tiền hoàn: ${payment.amount.toLocaleString('vi-VN')}đ</li>
          <li>Mã giao dịch: ${payment.transactionId}</li>
          <li>Trạng thái: Đã hoàn tiền</li>
        </ul>
        <p>Số tiền sẽ được hoàn về phương thức thanh toán của bạn trong vòng 3-7 ngày làm việc.</p>
        <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!</p>
      `;

      await sendEmail({
        email: booking.user.email,
        subject: 'Xác nhận hoàn tiền',
        message
      });

    } catch (error) {
      console.error('Lỗi gửi thông báo hoàn tiền:', error);
    }
  }
}

module.exports = ZaloPayService;