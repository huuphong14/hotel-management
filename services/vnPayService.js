const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const moment = require('moment');

class VNPayService {
  constructor() {
    this.config = {
      vnpTmnCode: process.env.VNPAY_TMN_CODE,
      vnpHashSecret: process.env.VNPAY_HASH_SECRET,
      vnpUrl: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      vnpApi: process.env.VNPAY_API || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      vnpReturnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:3000/api/bookings/vnpay-return',
      vnpRefundUrl: process.env.VNPAY_REFUND_URL || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      returnUrl: process.env.CLIENT_URL + '/payment-result'
    };
  }

  // Tạo URL thanh toán
  async createPaymentUrl(booking) {
    console.log("[VNPay] Creating payment URL for booking:", booking && booking._id ? booking._id : booking);
    console.log("[VNPay] Booking data:", JSON.stringify(booking));
    
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
      vnp_Amount: Math.round(booking.finalPrice * 100), // Đảm bảo là số nguyên
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate
    };

    console.log("[VNPay] Params before signing:", JSON.stringify(vnpParams));

    // Sắp xếp các tham số theo thứ tự alphabet
    const sortedParams = this.sortObject(vnpParams);
    console.log("[VNPay] Sorted params:", JSON.stringify(sortedParams));
    
    // Tạo chuỗi ký
    const signData = Object.keys(sortedParams)
      .map(key => `${key}=${sortedParams[key]}`)
      .join('&');
    console.log("[VNPay] signData:", signData);
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(signData, 'utf-8').digest('hex');
    
    vnpParams['vnp_SecureHash'] = signed;
    vnpUrl += '?' + Object.keys(vnpParams)
      .map(key => `${key}=${encodeURIComponent(vnpParams[key])}`)
      .join('&');
    
    console.log("[VNPay] Generated payment URL:", vnpUrl);
    
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
    const signData = Object.keys(sortedParams)
      .map(key => `${key}=${sortedParams[key]}`)
      .join('&');
    const hmac = crypto.createHmac('sha512', this.config.vnpHashSecret);
    const signed = hmac.update(signData, 'utf-8').digest('hex');
    
    return secureHash === signed;
  }

  // Xử lý callback từ VNPay
  async handleCallback(req, res) {
    const vnpParams = req.query;
    console.log("[VNPay] Callback received params:", JSON.stringify(vnpParams));
    const isValidSignature = this.verifyReturnUrl(vnpParams);

    console.log("[VNPay] Signature validation:", isValidSignature ? "Valid" : "Invalid");

    if (!isValidSignature) {
      console.error("[VNPay] Invalid signature for callback", JSON.stringify(vnpParams));
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
        console.error("[VNPay] Payment not found:", transactionId);
        return res.redirect(`${this.config.returnUrl}?status=failed&message=Payment%20not%20found`);
      }

      // Tìm booking tương ứng
      const booking = await Booking.findById(payment.bookingId);
      if (!booking) {
        console.error("[VNPay] Booking not found for payment:", payment.bookingId);
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

        console.log(`[VNPay] Payment ${transactionId} completed successfully`);
        return res.redirect(`${this.config.returnUrl}?status=success&bookingId=${booking._id}`);
      } else {
        // Thanh toán thất bại
        payment.status = 'failed';
        await payment.save();

        console.log(`[VNPay] Payment ${transactionId} failed with code: ${responseCode}`);
        return res.redirect(`${this.config.returnUrl}?status=failed&code=${responseCode}`);
      }
    } catch (error) {
      console.error("[VNPay] Error processing callback:", error);
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

      // Cập nhật trạng thái payment thành đang xử lý hoàn tiền
      payment.status = 'refunding';
      await payment.save();

      // Tạo dữ liệu hoàn tiền
      const date = new Date();
      const vnp_RequestId = moment(date).format('HHmmss');
      const vnp_Version = '2.1.0';
      const vnp_Command = 'refund';
      const vnp_TmnCode = this.config.vnpTmnCode;
      const vnp_TransactionType = '02'; // 02: Hoàn tiền toàn phần
      const vnp_TxnRef = payment.transactionId;
      const vnp_Amount = Math.round(payment.amount * 100);
      const vnp_TransactionNo = payment.vpnTransId;
      const vnp_TransactionDate = moment(payment.createdAt).format('YYYYMMDDHHmmss');
      const vnp_CreateBy = 'hotel_management';
      const vnp_OrderInfo = `Hoan tien dat phong #${booking._id}`;
      const vnp_IpAddr = '127.0.0.1';
      const vnp_CreateDate = moment(date).format('YYYYMMDDHHmmss');

      // Tạo chuỗi ký
      const data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + 
        vnp_TransactionType + "|" + vnp_TxnRef + "|" + vnp_Amount + "|" + vnp_TransactionNo + "|" + 
        vnp_TransactionDate + "|" + vnp_CreateBy + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;

      const hmac = crypto.createHmac('sha512', this.config.vnpHashSecret);
      const vnp_SecureHash = hmac.update(data, 'utf-8').digest('hex');

      // Tạo request hoàn tiền
      const dataObj = {
        vnp_RequestId: vnp_RequestId,
        vnp_Version: vnp_Version,
        vnp_Command: vnp_Command,
        vnp_TmnCode: vnp_TmnCode,
        vnp_TransactionType: vnp_TransactionType,
        vnp_TxnRef: vnp_TxnRef,
        vnp_Amount: vnp_Amount,
        vnp_TransactionNo: vnp_TransactionNo,
        vnp_CreateBy: vnp_CreateBy,
        vnp_OrderInfo: vnp_OrderInfo,
        vnp_TransactionDate: vnp_TransactionDate,
        vnp_CreateDate: vnp_CreateDate,
        vnp_IpAddr: vnp_IpAddr,
        vnp_SecureHash: vnp_SecureHash
      };

      console.log('[VNPay] Refund request data:', JSON.stringify(dataObj));

      try {
        // Gửi request hoàn tiền đến VNPay
        const response = await axios.post(this.config.vnpRefundUrl, dataObj, {
          headers: { 'Content-Type': 'application/json' }
        });

        console.log('[VNPay] Refund response:', response.data);

        if (response.data.vnp_ResponseCode === '00') {
          // Hoàn tiền thành công
          payment.status = 'refunded';
          payment.refundTransactionId = response.data.vnp_TransactionNo;
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
        } else {
          // Hoàn tiền thất bại
          payment.status = 'refund_failed';
          payment.refundFailReason = response.data.vnp_ResponseMessage;
          await payment.save();
          
          console.error(`Hoàn tiền thất bại cho booking ${booking._id}: ${response.data.vnp_ResponseMessage}`);
          return false;
        }
      } catch (error) {
        console.error(`Lỗi khi gửi yêu cầu hoàn tiền: ${error.message}`);
        payment.status = 'refund_failed';
        payment.refundFailReason = error.message;
        await payment.save();
        return false;
      }
    } catch (error) {
      console.error(`Lỗi khi hoàn tiền VNPay: ${error.message}`);
      return false;
    }
  }

  // Kiểm tra trạng thái hoàn tiền
  async checkRefundStatus(refundTransactionId) {
    try {
      const payment = await Payment.findOne({ refundTransactionId });
      if (!payment) {
        return {
          success: false,
          message: 'Không tìm thấy giao dịch hoàn tiền'
        };
      }

      // Trong môi trường thực tế, bạn sẽ gửi request API đến VNPay để kiểm tra trạng thái hoàn tiền
      // Đây là code mẫu, trong sandbox VNPay thường không có API kiểm tra hoàn tiền thực
      /*
      const tmnCode = this.config.vnpTmnCode;
      const secretKey = this.config.vnpHashSecret;
      const vnpApi = this.config.vnpRefundUrl;
      
      const date = new Date();
      const createDate = date.getFullYear() +
        ('0' + (date.getMonth() + 1)).slice(-2) +
        ('0' + date.getDate()).slice(-2) +
        ('0' + date.getHours()).slice(-2) +
        ('0' + date.getMinutes()).slice(-2) +
        ('0' + date.getSeconds()).slice(-2);
      
      const vnpParams = {
        vnp_Version: '2.1.0',
        vnp_Command: 'querydr',
        vnp_TmnCode: tmnCode,
        vnp_TxnRef: refundTransactionId,
        vnp_OrderInfo: `Kiem tra hoan tien #${payment.bookingId}`,
        vnp_TransactionDate: createDate,
        vnp_CreateDate: createDate,
        vnp_IpAddr: '127.0.0.1'
      };
      
      const sortedParams = this.sortObject(vnpParams);
      const signData = querystring.stringify(sortedParams, { encode: false });
      const hmac = crypto.createHmac('sha512', secretKey);
      const signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest('hex');
      
      vnpParams['vnp_SecureHash'] = signed;
      
      const response = await axios.post(vnpApi, vnpParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      if (response.data.vnp_ResponseCode === '00') {
        return {
          success: true,
          status: 'completed',
          refundTransactionId: refundTransactionId,
          refundAmount: payment.refundAmount || payment.amount,
          refundTimestamp: payment.refundTimestamp
        };
      } else {
        return {
          success: false,
          message: response.data.vnp_ResponseMessage
        };
      }
      */
      
      // Trong môi trường sandbox, trả về trạng thái từ database
      return {
        success: true,
        status: payment.status,
        refundTransactionId: payment.refundTransactionId,
        refundAmount: payment.refundAmount || payment.amount,
        refundTimestamp: payment.refundTimestamp
      };
    } catch (error) {
      console.error("Error checking refund status:", error);
      return {
        success: false,
        message: 'Lỗi kiểm tra trạng thái hoàn tiền'
      };
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