const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');

class VNPayService {
  constructor() {
    this.config = {
      vnpTmnCode: process.env.VNPAY_TMN_CODE,
      vnpHashSecret: process.env.VNPAY_HASH_SECRET,
      vnpUrl: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      vnpApi: process.env.VNPAY_API || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      vnpReturnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:3000/api/bookings/vnpay-return',
      returnUrl: process.env.CLIENT_URL + '/payment-result'
    };
  }

  // Tạo URL thanh toán
  async createPaymentUrl(booking) {
    console.log("Creating VNPay payment URL for booking:", booking._id);
    
    const ipAddr = '127.0.0.1'; // In production use req.headers['x-forwarded-for'] || req.connection.remoteAddress
    
    const tmnCode = this.config.vnpTmnCode;
    const secretKey = this.config.vnpHashSecret;
    
    let vnpUrl = this.config.vnpUrl;
    const returnUrl = this.config.vnpReturnUrl;
    
    const date = new Date();
    const createDate = date.getFullYear() +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      ('0' + date.getDate()).slice(-2) +
      ('0' + date.getHours()).slice(-2) +
      ('0' + date.getMinutes()).slice(-2) +
      ('0' + date.getSeconds()).slice(-2);
      
    // Tạo transaction ID duy nhất
    const transactionId = `B${booking._id.toString().slice(-8)}_${Date.now()}`;

    // Tạo payment record trong database
    const payment = await Payment.create({
      bookingId: booking._id,
      amount: booking.finalPrice,
      transactionId: transactionId,
      paymentMethod: 'vnpay',
      status: 'pending'
    });

    // Lưu thông tin transaction vào booking
    booking.paymentId = payment._id;
    booking.paymentMethod = 'vnpay';
    await booking.save();

    // Tạo dữ liệu thanh toán
    const orderInfo = `Thanh toan dat phong #${booking._id}`;
    const orderType = 'billpayment';
    const locale = 'vn';
    const currCode = 'VND';
    let vnpParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: locale,
      vnp_CurrCode: currCode,
      vnp_TxnRef: transactionId,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: orderType,
      vnp_Amount: booking.finalPrice * 100, // VNPay yêu cầu nhân 100
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate
    };

    // Sắp xếp các tham số theo thứ tự alphabet
    const sortedParams = this.sortObject(vnpParams);
    
    // Tạo chuỗi ký
    const signData = querystring.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest('hex');
    
    vnpParams['vnp_SecureHash'] = signed;
    vnpUrl += '?' + querystring.stringify(vnpParams, { encode: false });
    
    console.log("Generated VNPay URL:", vnpUrl);
    
    return {
      payUrl: vnpUrl,
      transactionId: transactionId
    };
  }

  // Phương thức xác thực callback từ VNPay
  verifyReturnUrl(vnpParams) {
    const secureHash = vnpParams['vnp_SecureHash'];
    delete vnpParams['vnp_SecureHash'];
    delete vnpParams['vnp_SecureHashType'];
    
    const sortedParams = this.sortObject(vnpParams);
    const signData = querystring.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', this.config.vnpHashSecret);
    const signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest('hex');
    
    return secureHash === signed;
  }

  // Xử lý callback từ VNPay
  async handleCallback(req, res) {
    const vnpParams = req.query;
    const isValidSignature = this.verifyReturnUrl(vnpParams);

    console.log("VNPay callback received:", vnpParams);
    console.log("Signature validation:", isValidSignature ? "Valid" : "Invalid");

    if (!isValidSignature) {
      console.error("Invalid VNPay signature");
      return res.redirect(`${this.config.returnUrl}?status=failed&message=Invalid%20signature`);
    }

    const transactionId = vnpParams['vnp_TxnRef'];
    const amount = vnpParams['vnp_Amount'] / 100; // VNPay trả về số tiền đã nhân 100
    const responseCode = vnpParams['vnp_ResponseCode'];
    const transDate = vnpParams['vnp_PayDate'];

    try {
      // Tìm payment record
      const payment = await Payment.findOne({ transactionId });
      if (!payment) {
        console.error("Payment not found:", transactionId);
        return res.redirect(`${this.config.returnUrl}?status=failed&message=Payment%20not%20found`);
      }

      // Tìm booking tương ứng
      const booking = await Booking.findById(payment.bookingId);
      if (!booking) {
        console.error("Booking not found for payment:", payment.bookingId);
        return res.redirect(`${this.config.returnUrl}?status=failed&message=Booking%20not%20found`);
      }

      if (responseCode === '00') {
        // Thanh toán thành công
        payment.status = 'completed';
        payment.vpnTransId = vnpParams['vnp_TransactionNo'];
        await payment.save();

        booking.paymentStatus = 'paid';
        booking.status = 'confirmed';
        await booking.save();

        console.log(`Payment ${transactionId} completed successfully`);
        return res.redirect(`${this.config.returnUrl}?status=success&bookingId=${booking._id}`);
      } else {
        // Thanh toán thất bại
        payment.status = 'failed';
        await payment.save();

        console.log(`Payment ${transactionId} failed with code: ${responseCode}`);
        return res.redirect(`${this.config.returnUrl}?status=failed&code=${responseCode}`);
      }
    } catch (error) {
      console.error("Error processing VNPay callback:", error);
      return res.redirect(`${this.config.returnUrl}?status=error&message=Server%20error`);
    }
  }

  // Kiểm tra trạng thái thanh toán
  async verifyPayment(transactionId) {
    try {
      const payment = await Payment.findOne({ transactionId });
      if (!payment) {
        return {
          success: false,
          message: 'Không tìm thấy giao dịch'
        };
      }

      return {
        success: true,
        status: payment.status,
        transactionId: payment.transactionId,
        amount: payment.amount
      };
    } catch (error) {
      console.error("Error verifying VNPay payment:", error);
      return {
        success: false,
        message: 'Lỗi kiểm tra giao dịch'
      };
    }
  }

  // Hoàn tiền
  async refundPayment(booking) {
    try {
      console.log(`Bắt đầu hoàn tiền cho booking ${booking._id}`);
      
      const payment = await Payment.findOne({ 
        bookingId: booking._id,
        status: 'completed'
      });

      if (!payment) {
        console.error(`Không tìm thấy payment đã hoàn thành cho booking ${booking._id}`);
        return false;
      }

      // Tạo request hoàn tiền đến VNPay
      const refundTransactionId = `R${payment.transactionId}_${Date.now()}`;
      const date = new Date();
      const createDate = date.getFullYear() +
        ('0' + (date.getMonth() + 1)).slice(-2) +
        ('0' + date.getDate()).slice(-2) +
        ('0' + date.getHours()).slice(-2) +
        ('0' + date.getMinutes()).slice(-2) +
        ('0' + date.getSeconds()).slice(-2);

      // Trong môi trường thực tế, bạn sẽ gửi request API đến VNPay
      // Đây là code mẫu, trong sandbox VNPay thường không có API hoàn tiền thực
      console.log(`Gửi yêu cầu hoàn tiền đến VNPay cho giao dịch ${payment.vpnTransId}`);

      // Cập nhật trạng thái payment
      payment.status = 'refunded';
      payment.refundTransactionId = refundTransactionId;
      payment.refundTimestamp = new Date();
      payment.refundAmount = payment.amount;
      await payment.save();

      // Cập nhật trạng thái booking
      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      booking.cancellationReason = 'user_requested';
      await booking.save();

      console.log(`Hoàn tiền thành công cho booking ${booking._id}`);
      return true;
    } catch (error) {
      console.error(`Lỗi khi hoàn tiền VNPay: ${error.message}`);
      return false;
    }
  }

  // Hàm sắp xếp object theo key
  sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      if (obj.hasOwnProperty(key)) {
        sorted[key] = obj[key];
      }
    }
    
    return sorted;
  }
}

module.exports = new VNPayService();