const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const moment = require('moment');
const { getInvoiceTemplate } = require('../utils/invoiceTemplate');
const { generatePDF } = require('../utils/generatePDF');
const sendEmail = require('../utils/sendEmail');

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

  async createPaymentUrl(booking) {
    console.log("[VNPay] Creating payment URL for booking:", booking && booking._id ? booking._id : booking);
    console.log("[VNPay] Booking data:", JSON.stringify(booking));

    const ipAddr = '127.0.0.1';
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

    const transactionId = `B${booking._id.toString().slice(-8)}_${Date.now()}`;

    // Làm sạch các giao dịch cũ
    await Payment.updateMany(
      { bookingId: booking._id, status: { $in: ['pending', 'failed'] } },
      { status: 'cancelled' }
    );
    console.log(`Cancelled existing pending/failed payments for booking ${booking._id}`);

    const existingPayment = await Payment.findOne({
      bookingId: booking._id,
      status: { $in: ['pending', 'failed', 'cancelled'] }
    });

    let payment;
    if (existingPayment) {
      console.log(`Found existing payment ${existingPayment.transactionId}, updating...`);
      existingPayment.transactionId = transactionId;
      existingPayment.status = 'pending';
      existingPayment.createdAt = new Date();
      await existingPayment.save();
      payment = existingPayment;
    } else {
      payment = await Payment.create({
        bookingId: booking._id,
        amount: booking.finalPrice,
        transactionId: transactionId,
        paymentMethod: 'vnpay',
        status: 'pending'
      });
    }

    booking.paymentId = payment._id;
    booking.paymentMethod = 'vnpay';
    await booking.save();

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
      vnp_Amount: Math.round(booking.finalPrice * 100),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate
    };

    console.log("[VNPay] Params before signing:", JSON.stringify(vnpParams));

    const sortedParams = this.sortObject(vnpParams);
    console.log("[VNPay] Sorted params:", JSON.stringify(sortedParams));

    const signData = Object.keys(sortedParams)
      .map(key => `${key}=${encodeURIComponent(sortedParams[key]).replace(/%20/g, '+')}`)
      .join('&');
    console.log("[VNPay] signData:", signData);

    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(signData, 'utf-8').digest('hex');

    vnpParams['vnp_SecureHash'] = signed;
    vnpUrl += '?' + Object.keys(vnpParams)
      .map(key => `${key}=${encodeURIComponent(vnpParams[key]).replace(/%20/g, '+')}`)
      .join('&');

    console.log("[VNPay] Generated payment URL:", vnpUrl);

    return {
      payUrl: vnpUrl,
      transactionId: transactionId
    };
  } catch(error) {
    console.error('[VNPay] Payment URL creation error:', error.response?.data || error.message);
    throw new Error(`Không thể tạo liên kết thanh toán: ${error.response?.data?.message || error.message}`);
  }

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
    const amount = vnpParams['vnp_Amount'] / 100;
    const responseCode = vnpParams['vnp_ResponseCode'];

    try {
      const payment = await Payment.findOne({ transactionId });
      if (!payment) {
        console.error("[VNPay] Payment not found:", transactionId);
        return res.redirect(`${this.config.returnUrl}?status=failed&message=Payment%20not%20found`);
      }

      const booking = await Booking.findById(payment.bookingId)
        .populate([
          { path: 'room', select: 'name hotelId', populate: { path: 'hotelId', select: 'name address' } },
          { path: 'user', select: 'name email' },
        ]);

      if (!booking) {
        console.error("[VNPay] Booking not found for payment:", payment.bookingId);
        return res.redirect(`${this.config.returnUrl}?status=failed&message=Booking%20not%20found`);
      }

      if (responseCode === '00') {
        payment.status = 'completed';
        payment.vpnTransId = vnpParams['vnp_TransactionNo'];
        await payment.save();

        booking.paymentStatus = 'paid';
        booking.status = 'confirmed';
        await booking.save();

        // Tạo và gửi PDF
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
          hotel: booking.room?.hotelId,
        });

        const pdfBuffer = await generatePDF(htmlContent);

        const message = `
        <h1>Xác nhận thanh toán</h1>
        <p>Xin chào ${booking.user.name},</p>
        <p>Chúng tôi xác nhận đã nhận được thanh toán của bạn cho đơn đặt phòng.</p>
        <p>Thông tin thanh toán:</p>
        <ul>
          <li>Mã đơn: ${booking._id}</li>
          <li>Khách sạn: ${booking.room?.hotelId?.name || 'Không xác định'}</li>
          <li>Số tiền: ${amount.toLocaleString('vi-VN')}đ</li>
          <li>Mã giao dịch: ${transactionId}</li>
          <li>Trạng thái: Đã thanh toán</li>
        </ul>
        <p>Hóa đơn chi tiết đã được đính kèm dưới dạng PDF.</p>
        <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!</p>
      `;

        await sendEmail({
          email: booking.user.email,
          subject: 'Xác nhận thanh toán thành công',
          message,
          attachments: [
            {
              filename: `invoice-${booking._id}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        });

        console.log(`[VNPay] Payment ${transactionId} completed successfully`);
        return res.redirect(`${this.config.returnUrl}?status=success&bookingId=${booking._id}`);
      } else {
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

  verifyReturnUrl(vnpParams) {
    const secureHash = vnpParams['vnp_SecureHash'];
    delete vnpParams['vnp_SecureHash'];
    delete vnpParams['vnp_SecureHashType'];

    const sortedParams = this.sortObject(vnpParams);
    const signData = Object.keys(sortedParams)
      .map(key => `${key}=${encodeURIComponent(sortedParams[key]).replace(/%20/g, '+')}`)
      .join('&');

    const hmac = crypto.createHmac('sha512', this.config.vnpHashSecret);
    const signed = hmac.update(signData, 'utf-8').digest('hex');

    return secureHash === signed;
  }

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

      payment.status = 'refunding';
      await payment.save();

      const date = new Date();
      const vnp_RequestId = moment(date).format('HHmmss');
      const vnp_Version = '2.1.0';
      const vnp_Command = 'refund';
      const vnp_TmnCode = this.config.vnpTmnCode;
      const vnp_TransactionType = '02';
      const vnp_TxnRef = payment.transactionId;
      const vnp_Amount = Math.round(payment.amount * 100);
      const vnp_TransactionNo = payment.vpnTransId;
      const vnp_TransactionDate = moment(payment.createdAt).format('YYYYMMDDHHmmss');
      const vnp_CreateBy = 'hotel_management';
      const vnp_OrderInfo = `Hoan tien dat phong #${booking._id}`;
      const vnp_IpAddr = '127.0.0.1';
      const vnp_CreateDate = moment(date).format('YYYYMMDDHHmmss');

      const data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" +
        vnp_TransactionType + "|" + vnp_TxnRef + "|" + vnp_Amount + "|" + vnp_TransactionNo + "|" +
        vnp_TransactionDate + "|" + vnp_CreateBy + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;

      console.log('[VNPay] Refund signData:', data);

      const hmac = crypto.createHmac('sha512', this.config.vnpHashSecret);
      const vnp_SecureHash = hmac.update(data, 'utf-8').digest('hex');

      const dataObj = {
        vnp_RequestId,
        vnp_Version,
        vnp_Command,
        vnp_TmnCode,
        vnp_TransactionType,
        vnp_TxnRef,
        vnp_Amount,
        vnp_TransactionNo,
        vnp_CreateBy,
        vnp_OrderInfo,
        vnp_TransactionDate,
        vnp_CreateDate,
        vnp_IpAddr,
        vnp_SecureHash
      };

      console.log('[VNPay] Refund request data:', JSON.stringify(dataObj));

      try {
        const response = await axios.post(this.config.vnpRefundUrl, dataObj, {
          headers: { 'Content-Type': 'application/json' }
        });

        console.log('[VNPay] Refund response:', response.data);

        if (response.data.vnp_ResponseCode === '00') {
          payment.status = 'refunded';
          payment.refundTransactionId = response.data.vnp_TransactionNo;
          payment.refundTimestamp = new Date();
          payment.refundAmount = payment.amount;
          await payment.save();

          booking.status = 'cancelled';
          booking.cancelledAt = new Date();
          booking.cancellationReason = 'user_requested';
          await booking.save();

          console.log(`Hoàn tiền thành công cho booking ${booking._id}`);
          return true;
        } else {
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

  async checkRefundStatus(refundTransactionId) {
    try {
      const payment = await Payment.findOne({ refundTransactionId });
      if (!payment) {
        return {
          success: false,
          message: 'Không tìm thấy giao dịch hoàn tiền'
        };
      }

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