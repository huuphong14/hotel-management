// Thêm vào zaloPayService.js
const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const NotificationService = require('../services/notificationService');
const sendEmail = require('../utils/sendEmail');

class ZaloPayService {
  static config = {
    appId: process.env.ZALOPAY_APP_ID,
    key1: process.env.ZALOPAY_KEY1,
    key2: process.env.ZALOPAY_KEY2,
    endpoint: process.env.ZALOPAY_ENDPOINT,
    returnUrl: process.env.ZALOPAY_RETURN_URL,
    cancelUrl: process.env.ZALOPAY_CANCEL_URL,
    callbackUrl: process.env.ZALOPAY_CALLBACK_URL // Thêm URL callback
  };

  // Các phương thức hiện tại
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

  // Tạo chữ ký cho callback
  static verifyCallbackSignature(data, mac) {
    // ZaloPay sẽ gửi dữ liệu và chữ ký (mac)
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

    const orderData = {
      app_id: Number(this.config.appId),
      app_user: booking.user.toString(),
      app_trans_id: transactionId,
      app_time: Date.now(),
      item: JSON.stringify([{
        itemid: booking.room.toString(),
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
      callback_url: this.config.callbackUrl // Thêm callback URL
    };

    // Tạo chữ ký
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

      // Tạo bản ghi thanh toán
      await Payment.create({
        bookingId: booking._id,
        amount: amount,
        paymentMethod: 'zalopay',
        status: 'pending',
        transactionId: transactionId
      });

      return {
        payUrl: response.data.order_url,
        transactionId: transactionId
      };
    } catch (error) {
      console.error('ZaloPay payment URL creation error:', error.response?.data || error.message);
      throw new Error('Không thể tạo liên kết thanh toán');
    }
  }

  // Cải thiện phương thức refundPayment
  static async refundPayment(booking) {
    const payment = await Payment.findOne({
      bookingId: booking._id,
      status: 'completed'
    });

    if (!payment) {
      throw new Error('Không tìm thấy giao dịch thanh toán');
    }

    const refundData = {
      app_id: this.config.appId,
      app_trans_id: this.generateTransactionId(), // Tạo ID giao dịch mới cho hoàn tiền
      zp_trans_id: payment.transactionId,
      amount: payment.amount,
      description: `Refund for Booking ${booking._id}`,
      timestamp: Date.now()
    };

    // Tạo chữ ký cho hoàn tiền
    const dataStr = `${this.config.appId}|${refundData.app_trans_id}|${refundData.zp_trans_id}|${refundData.amount}|${refundData.timestamp}`;
    const signature = crypto
      .createHmac('sha256', this.config.key1)
      .update(dataStr)
      .digest('hex');

    refundData.mac = signature;

    try {
      const response = await axios.post(`${this.config.endpoint}/refund`, refundData);

      if (response.data.return_code === 1) {
        // Cập nhật trạng thái thanh toán
        payment.status = 'refunded';
        await payment.save();

        // Cập nhật trạng thái booking
        booking.status = 'cancelled';
        await booking.save();

        // Gửi email thông báo hoàn tiền
        await this.sendRefundNotification(booking, payment);

        return true;
      }

      return false;
    } catch (error) {
      console.error('ZaloPay refund error:', error.response?.data || error.message);
      throw new Error('Không thể thực hiện hoàn tiền');
    }
  }

  // Phương thức xác minh thanh toán
  static async verifyPayment(transactionId) {
    try {
      const data = {
        app_id: this.config.appId,
        app_trans_id: transactionId,
      };

      const mac = crypto
        .createHmac('sha256', this.config.key1)
        .update(`${data.app_id}|${data.app_trans_id}`)
        .digest('hex');

      data.mac = mac;

      const response = await axios.post(`${this.config.endpoint}/query`, null, {
        params: data,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      return response.data;
    } catch (error) {
      console.error('Lỗi kiểm tra trạng thái thanh toán:', error.message);
      throw new Error('Không thể kiểm tra trạng thái thanh toán');
    }
  }

  static async handleCallback(req, res) {
    console.log('==== ZALOPAY CALLBACK STARTED ====');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers));

    try {
      // Kiểm tra body
      if (!req.body || Object.keys(req.body).length === 0) {
        console.error('ERROR: Empty callback data received');
        return res.status(400).json({
          return_code: -1,
          return_message: 'Empty data received'
        });
      }

      const callbackData = req.body;
      console.log('Received ZaloPay callback data:', JSON.stringify(callbackData, null, 2));

      // Kiểm tra các trường bắt buộc
      const requiredFields = ['app_id', 'app_trans_id', 'mac', 'amount', 'embed_data'];
      const missingFields = requiredFields.filter(field => !callbackData[field]);

      if (missingFields.length > 0) {
        console.error(`ERROR: Missing required fields: ${missingFields.join(', ')}`);
        return res.status(400).json({
          return_code: -1,
          return_message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Xác minh chữ ký
      console.log('Verifying signature...');
      const receivedMac = callbackData.mac;
      console.log('Received MAC:', receivedMac);

      // Tạo data string để verify
      const dataStr = Object.keys(callbackData)
        .filter(key => key !== 'mac')
        .sort()
        .map(key => `${key}=${callbackData[key]}`)
        .join('&');

      console.log('Data string for verification:', dataStr);

      const calculatedSignature = crypto
        .createHmac('sha256', this.config.key2)
        .update(dataStr)
        .digest('hex');

      console.log('Calculated signature:', calculatedSignature);
      console.log('Signature matches:', calculatedSignature === receivedMac);

      if (calculatedSignature !== receivedMac) {
        console.error('ERROR: Invalid callback signature');
        return res.status(400).json({
          return_code: -1,
          return_message: 'Invalid signature'
        });
      }

      // Parsing embedded data
      let bookingId;
      try {
        console.log('Parsing embed_data...');
        const embedData = JSON.parse(callbackData.embed_data);
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

      const { app_trans_id, amount, zp_trans_id, trans_status } = callbackData;

      // Tìm giao dịch thanh toán
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

      // Cập nhật thông tin thanh toán
      console.log('Updating payment information...');
      payment.zpTransactionId = zp_trans_id; // Lưu lại ID giao dịch của ZaloPay

      // Kiểm tra trạng thái giao dịch
      console.log('Transaction status from ZaloPay:', trans_status);

      if (trans_status === 1) { // Thành công
        console.log('Payment successful. Updating status to "completed"');
        payment.status = 'completed';
        await payment.save();
        console.log('Payment status updated successfully');

        // Cập nhật trạng thái booking
        console.log('Fetching booking with ID:', bookingId);
        const booking = await Booking.findById(bookingId);

        if (booking) {
          console.log('Found booking:', JSON.stringify(booking));
          console.log('Updating booking status to "confirmed" and payment status to "paid"');

          booking.status = 'confirmed';
          booking.paymentStatus = 'paid';
          await booking.save();
          console.log('Booking updated successfully');

          // Gửi thông báo và email xác nhận
          console.log('Sending payment confirmation...');
          await this.sendPaymentConfirmation(booking, payment);
          console.log('Payment confirmation sent');
        } else {
          console.error(`ERROR: Booking with ID ${bookingId} not found`);
        }
      } else if (trans_status === 2) { // Thất bại
        console.log('Payment failed. Updating status to "failed"');
        payment.status = 'failed';
        await payment.save();
        console.log('Payment status updated to "failed"');

        // Cập nhật trạng thái booking
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

      // Phản hồi cho ZaloPay
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

  // Xử lý khi người dùng quay lại từ cổng thanh toán
  static async handleRedirect(req, res) {
    try {
      console.log("Nhận request từ cổng thanh toán:", req.query);

      const { status, apptransid } = req.query;

      // Kiểm tra trạng thái giao dịch
      if (status === '1') { // Success
        console.log(`Giao dịch thành công, transactionId: ${apptransid}`);

        // Xác minh lại với ZaloPay
        const verifyResult = await this.verifyPayment(apptransid);
        console.log("Kết quả xác minh từ ZaloPay:", verifyResult);

        if (verifyResult.return_code === 1) {
          // Tìm giao dịch và cập nhật nếu chưa được cập nhật bởi callback
          const payment = await Payment.findOne({ transactionId: apptransid });
          console.log("Thông tin thanh toán trước khi cập nhật:", payment);

          if (payment && payment.status !== 'completed') {
            payment.status = 'completed';
            await payment.save();
            console.log("Đã cập nhật trạng thái thanh toán:", payment);

            const booking = await Booking.findById(payment.bookingId);
            console.log("Thông tin đặt phòng trước khi cập nhật:", booking);

            if (booking) {
              booking.status = 'confirmed';
              booking.paymentStatus = 'paid';
              await booking.save();
              console.log("Đã cập nhật trạng thái đặt phòng:", booking);

              // Gửi thông báo xác nhận
              await this.sendPaymentConfirmation(booking, payment);
              console.log("Đã gửi thông báo xác nhận thanh toán.");
            }
          }

          // Chuyển hướng người dùng đến trang thành công
          console.log(`Chuyển hướng đến trang thành công: /booking-success/${payment.bookingId}`);
          return res.redirect(`/booking-success/${payment.bookingId}`);
        }
      }

      // Chuyển hướng đến trang thất bại nếu không thành công
      console.log("Giao dịch thất bại hoặc không xác minh được. Chuyển hướng đến /payment-failed");
      return res.redirect('/payment-failed');
    } catch (error) {
      console.error('Lỗi xử lý redirect:', error);
      return res.redirect('/payment-error');
    }
  }


  // Gửi thông báo xác nhận thanh toán
  static async sendPaymentConfirmation(booking, payment) {
    try {
      // Lấy thông tin phòng và người dùng
      await booking.populate([
        { path: 'room', select: 'name type price' },
        { path: 'user', select: 'name email' }
      ]);

      // Tạo thông báo
      await NotificationService.createNotification({
        user: booking.user._id,
        title: 'Thanh toán thành công',
        message: `Bạn đã thanh toán thành công cho đơn đặt phòng #${booking._id}`,
        type: 'payment',
        relatedModel: 'Booking',
        relatedId: booking._id
      });

      // Gửi email
      const message = `
        <h1>Xác nhận thanh toán</h1>
        <p>Xin chào ${booking.user.name},</p>
        <p>Chúng tôi xác nhận đã nhận được thanh toán của bạn cho đơn đặt phòng.</p>
        <p>Thông tin thanh toán:</p>
        <ul>
          <li>Mã đơn: ${booking._id}</li>
          <li>Phòng: ${booking.room.name}</li>
          <li>Số tiền: ${payment.amount.toLocaleString()}đ</li>
          <li>Mã giao dịch: ${payment.transactionId}</li>
          <li>Trạng thái: Đã thanh toán</li>
        </ul>
        <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!</p>
      `;

      await sendEmail({
        email: booking.user.email,
        subject: 'Xác nhận thanh toán thành công',
        message
      });

    } catch (error) {
      console.error('Lỗi gửi thông báo xác nhận thanh toán:', error);
    }
  }

  // Gửi thông báo hoàn tiền
  static async sendRefundNotification(booking, payment) {
    try {
      // Lấy thông tin phòng và người dùng
      await booking.populate([
        { path: 'room', select: 'name type price' },
        { path: 'user', select: 'name email' }
      ]);

      // Tạo thông báo
      await NotificationService.createNotification({
        user: booking.user._id,
        title: 'Hoàn tiền thành công',
        message: `Đơn đặt phòng #${booking._id} đã được hoàn tiền thành công`,
        type: 'refund',
        relatedModel: 'Booking',
        relatedId: booking._id
      });

      // Gửi email
      const message = `
        <h1>Xác nhận hoàn tiền</h1>
        <p>Xin chào ${booking.user.name},</p>
        <p>Chúng tôi xác nhận đã hoàn tiền cho đơn đặt phòng của bạn.</p>
        <p>Thông tin hoàn tiền:</p>
        <ul>
          <li>Mã đơn: ${booking._id}</li>
          <li>Phòng: ${booking.room.name}</li>
          <li>Số tiền hoàn: ${payment.amount.toLocaleString()}đ</li>
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