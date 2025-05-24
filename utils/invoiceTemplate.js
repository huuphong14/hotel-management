const getInvoiceTemplate = (booking) => {
    const {
        _id,
        room,
        checkIn,
        checkOut,
        originalPrice,
        discountAmount,
        finalPrice,
        paymentMethod,
        contactInfo,
        guestInfo,
        specialRequests,
        bookingFor,
    } = booking;

    const checkInFormatted = new Date(checkIn).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const checkOutFormatted = new Date(checkOut).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const bookingDate = new Date().toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    const numberOfDays = Math.ceil(
        (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
    );

    const formattedPaymentMethod =
        paymentMethod === 'zalopay'
            ? 'ZaloPay'
            : paymentMethod === 'vnpay'
                ? 'VNPay'
                : paymentMethod === 'credit_card'
                    ? 'Thẻ tín dụng'
                    : 'PayPal';

    const guestName = bookingFor === 'other' && guestInfo?.name ? guestInfo.name : contactInfo.name;
    const guestCount = room?.capacity || 1;
    const hotel = room?.hotelId || {};

    return `
         <!DOCTYPE html>
         <html lang="vi">
         <head>
           <meta charset="UTF-8">
           <style>
             body {
               font-family: Arial, sans-serif;
               margin: 40px;
               color: #333;
             }
             .invoice-container {
               max-width: 800px;
               margin: 0 auto;
               border: 1px solid #ddd;
               padding: 20px;
               border-radius: 8px;
             }
             .header {
               text-align: center;
               border-bottom: 2px solid #007bff;
               padding-bottom: 10px;
               margin-bottom: 20px;
             }
             .header h1 {
               color: #007bff;
               margin: 0;
               font-size: 24px;
             }
             .section {
               margin-bottom: 20px;
             }
             .section h2 {
               color: #007bff;
               font-size: 18px;
               margin-bottom: 10px;
             }
             table {
               width: 100%;
               border-collapse: collapse;
               margin-bottom: 20px;
             }
             th, td {
               border: 1px solid #ddd;
               padding: 8px;
               text-align: left;
             }
             th {
               background-color: #f2f2f2;
               font-weight: bold;
             }
             .total {
               font-weight: bold;
               font-size: 16px;
             }
             .notes {
               background-color: #f9f9f9;
               padding: 10px;
               border-radius: 5px;
             }
             .notes ul {
               margin: 0;
               padding-left: 20px;
             }
           </style>
         </head>
         <body>
           <div class="invoice-container">
             <div class="header">
               <h1>PHIẾU THANH TOÁN KHÁCH SẠN</h1>
               <p><strong>Mã đặt chỗ:</strong> ${_id}</p>
               <p><strong>Khách sạn:</strong> ${hotel?.name || 'Không xác định'}</p>
               <p><strong>Địa chỉ:</strong> ${hotel?.address || 'Không xác định'}</p>
               <p><strong>Ngày đặt:</strong> ${bookingDate}</p>
             </div>

             <div class="section">
               <h2>Thông tin đặt chỗ</h2>
               <table>
                 <tr>
                   <th>Khách sạn</th>
                   <th>Khách</th>
                   <th>Số khách mỗi phòng</th>
                   <th>Giá phòng</th>
                 </tr>
                 <tr>
                   <td>${hotel?.name || 'Không xác định'}</td>
                   <td>${guestName}</td>
                   <td>${guestCount} Người</td>
                   <td>${originalPrice.toLocaleString('vi-VN')}đ</td>
                 </tr>
               </table>
               <p><strong>Ngày nhận phòng:</strong> ${checkInFormatted}</p>
               <p><strong>Ngày trả phòng:</strong> ${checkOutFormatted}</p>
               <p><strong>Số đêm:</strong> ${numberOfDays}</p>
             </div>

             <div class="section">
               <h2>Chi tiết thanh toán</h2>
               <p>Giá gốc: ${originalPrice.toLocaleString('vi-VN')}đ</p>
               ${discountAmount > 0 ? `<p>Giảm giá: -${discountAmount.toLocaleString('vi-VN')}đ</p>` : ''}
               <p class="total">Tổng thanh toán: ${finalPrice.toLocaleString('vi-VN')}đ</p>
               <p><strong>Phương thức thanh toán:</strong> ${formattedPaymentMethod}</p>
             </div>

             ${(specialRequests?.earlyCheckIn || specialRequests?.lateCheckOut || specialRequests?.additionalRequests) ?
            `
               <div class="section notes">
                 <h2>Lưu ý quan trọng</h2>
                 <p>Tất cả yêu cầu đặc biệt phải được khách sạn xác nhận trước khi nhận phòng.</p>
                 <h3>Yêu cầu đặc biệt:</h3>
                 <ul>
                   ${specialRequests.earlyCheckIn ? '<li>Check-in sớm</li>' : ''}
                   ${specialRequests.lateCheckOut ? '<li>Check-out muộn</li>' : ''}
                   ${specialRequests.additionalRequests ? `<li>${specialRequests.additionalRequests}</li>` : ''}
                 </ul>
               </div>
               ` : ''
        }
           </div>
         </body>
         </html>
       `;
};

module.exports = { getInvoiceTemplate };