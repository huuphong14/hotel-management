const User = require("../models/User");
const Hotel = require("../models/Hotel");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendTokenResponse } = require("../utils/tokenUtils");
const sendEmail = require("../utils/sendEmail");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const passport = require("passport");
const asyncHandler = require("../middlewares/asyncHandler");
const cloudinaryService = require("../config/cloudinaryService");

// Hàm tạo mã OTP 6 số
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: "Đăng ký tài khoản người dùng"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Đăng ký thành công, gửi email xác nhận"
 *       400:
 *         description: "Dữ liệu không hợp lệ hoặc email đã tồn tại"
 *       500:
 *         description: "Lỗi server"
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }

    // Kiểm tra email đã tồn tại
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        success: false,
        message: "Email đã được đăng ký",
      });
    }

    // Tạo user mới với role mặc định là 'user'
    user = await User.create({
      name,
      email,
      password,
      role: "user",
    });

    // Tạo token xác thực email
    const verificationToken = user.getVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Tạo URL xác thực
    const verificationUrl = `${config.clientUrl}/verify-email/${verificationToken}`;

    // Nội dung email
    const message = `
      <h1>Xác nhận đăng ký tài khoản</h1>
      <p>Cảm ơn bạn đã đăng ký tài khoản tại hệ thống của chúng tôi.</p>
      <p>Vui lòng nhấn vào đường dẫn sau để xác nhận email của bạn:</p>
      <a href="${verificationUrl}" target="_blank">Xác nhận email</a>
      <p>Đường dẫn có hiệu lực trong 24 giờ.</p>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: "Xác nhận đăng ký tài khoản",
        message,
      });

      res.status(200).json({
        success: true,
        message: "Email xác nhận đã được gửi",
      });
    } catch (error) {
      user.verificationToken = undefined;
      user.verificationTokenExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: "Không thể gửi email xác nhận",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/verify-email/{token}:
 *   get:
 *     summary: "Xác thực email"
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: "Token xác thực email"
 *     responses:
 *       200:
 *         description: "Xác thực email thành công"
 *       400:
 *         description: "Token không hợp lệ hoặc đã hết hạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.verifyEmail = async (req, res) => {
  try {
    const verificationToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      verificationToken,
      verificationTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Token không hợp lệ hoặc đã hết hạn",
      });
    }

    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Xác thực email thành công",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: "Đăng nhập"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Đăng nhập thành công"
 *       401:
 *         description: "Thông tin đăng nhập không chính xác"
 *       500:
 *         description: "Lỗi server"
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Thông tin đăng nhập không chính xác",
      });
    }

    if (!user.isEmailVerified || user.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Tài khoản chưa được xác thực hoặc chưa được kích hoạt",
      });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Thông tin đăng nhập không chính xác",
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: "Lấy thông tin người dùng hiện tại"
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Lấy thông tin thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/logout:
 *   get:
 *     summary: "Đăng xuất"
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Đăng xuất thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = undefined;
      await user.save({ validateBeforeSave: false });
    }

    res.cookie("token", "none", {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    res.cookie("refreshToken", "none", {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    res.status(200).json({
      success: true,
      message: "Đăng xuất thành công",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: "Làm mới access token"
 *     tags: [Auth]
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: "Trả về access token mới"
 *       401:
 *         description: "Không có refresh token"
 *       403:
 *         description: "Refresh token không hợp lệ hoặc hết hạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Không có refresh token" });
    }

    const user = await User.findOne({ refreshToken });

    if (!user) {
      return res
        .status(403)
        .json({ success: false, message: "Refresh token không hợp lệ" });
    }

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: "Refresh token hết hạn hoặc không hợp lệ",
        });
      }

      const newAccessToken = user.getAccessToken();
      res.status(200).json({ success: true, accessToken: newAccessToken });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

/**
 * @swagger
 * /api/auth/password/forgot:
 *   post:
 *     summary: "Gửi mã OTP đặt lại mật khẩu"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Gửi mã OTP thành công"
 *       404:
 *         description: "Email không tồn tại"
 *       500:
 *         description: "Lỗi server"
 */
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Email không tồn tại trong hệ thống",
      });
    }

    const otp = generateOTP();
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 phút
    await user.save({ validateBeforeSave: false });

    const message = `<h1>Mã OTP: ${otp}</h1>`;
    await sendEmail({ email: user.email, subject: "Mã OTP", message });

    res.status(200).json({ success: true, message: "Mã OTP đã được gửi" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

/**
 * @swagger
 * /api/auth/password/verify-otp:
 *   post:
 *     summary: "Xác thực mã OTP"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Xác thực OTP thành công"
 *       400:
 *         description: "OTP không hợp lệ hoặc đã hết hạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordToken || !user.resetPasswordExpire) {
      return res
        .status(400)
        .json({ success: false, message: "OTP không hợp lệ hoặc đã hết hạn" });
    }

    const hashedOTP = crypto
      .createHash("sha256")
      .update(String(otp).trim())
      .digest("hex");
    if (
      hashedOTP !== user.resetPasswordToken ||
      user.resetPasswordExpire < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Mã OTP không hợp lệ hoặc đã hết hạn",
      });
    }

    res.status(200).json({ success: true, message: "Xác thực OTP thành công" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

/**
 * @swagger
 * /api/auth/password/reset:
 *   post:
 *     summary: "Đặt lại mật khẩu"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Đặt lại mật khẩu thành công"
 *       400:
 *         description: "OTP không hợp lệ hoặc đã hết hạn"
 *       500:
 *         description: "Lỗi server"
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    console.log("[RESET PASSWORD] Received request:", {
      email,
      otp,
      password: password ? "***" : undefined,
    });

    if (!email || !otp || !password) {
      console.warn("[RESET PASSWORD] Missing required fields");
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp email, OTP và mật khẩu mới",
      });
    }

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(String(otp).trim())
      .digest("hex");

    console.log("[RESET PASSWORD] Generated reset token:", resetPasswordToken);

    const user = await User.findOne({
      email,
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      console.warn(
        "[RESET PASSWORD] Không tìm thấy người dùng hoặc OTP đã hết hạn"
      );
      return res.status(400).json({
        success: false,
        message: "Mã OTP không hợp lệ hoặc đã hết hạn",
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();
    console.log("[RESET PASSWORD] Password reset thành công cho user:", email);

    res.status(200).json({
      success: true,
      message: "Đặt lại mật khẩu thành công",
    });
  } catch (error) {
    console.error("[RESET PASSWORD] Server error:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: "Đăng nhập bằng Google"
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: "Chuyển hướng sang Google để xác thực"
 */
exports.googleAuth = passport.authenticate("google", {
  scope: ["profile", "email"],
});

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: "Callback sau khi đăng nhập Google" 
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: "Chuyển hướng về frontend với token"
 */
exports.googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      console.error("Google auth failed:", req.session.messages);
      return res.redirect(
        `${
          config.clientUrl
        }/login?error=auth_failed&message=${encodeURIComponent(
          req.session.messages?.[0] || "Xác thực Google thất bại"
        )}`
      );
    }

    const { email, displayName } = req.user;

    let existingUser = await User.findOne({ email });
    if (!existingUser) {
      existingUser = await User.create({
        name: displayName,
        email,
        password: crypto.randomBytes(20).toString("hex"),
        isEmailVerified: true,
        provider: "google",
      }).catch((err) => {
        console.error("Error creating Google user:", err);
        throw new Error("Không thể tạo người dùng mới");
      });
    } else if (existingUser.provider !== "google") {
      return res.redirect(
        `${
          config.clientUrl
        }/login?error=email_used&message=${encodeURIComponent(
          "Email đã được đăng ký bằng phương thức khác"
        )}`
      );
    }

    if (
      existingUser.status === "rejected" ||
      existingUser.status === "pending"
    ) {
      return res.redirect(
        `${
          config.clientUrl
        }/login?error=account_inactive&message=${encodeURIComponent(
          "Tài khoản chưa được kích hoạt hoặc bị từ chối"
        )}`
      );
    }

    const token = existingUser.getAccessToken();
    const refreshToken = existingUser.getRefreshToken();
    existingUser.refreshToken = refreshToken;
    await existingUser.save({ validateBeforeSave: false });

    res.cookie("token", token, { httpOnly: true });
    res.cookie("refreshToken", refreshToken, { httpOnly: true });

    res.redirect(
      `${config.clientUrl}/oauth?token=${token}&refreshToken=${refreshToken}`
    );
  } catch (error) {
    console.error("Google Callback error:", error);
    res.redirect(
      `${
        config.clientUrl
      }/login?error=server_error&message=${encodeURIComponent(
        error.message || "Lỗi server"
      )}`
    );
  }
};

/**
 * @swagger
 * /api/auth/facebook:
 *   get:
 *     summary: "Đăng nhập bằng Facebook"
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: "Chuyển hướng sang Facebook để xác thực"
 */
exports.facebookAuth = passport.authenticate("facebook", {
  scope: ["email"],
});

/**
 * @swagger
 * /api/auth/facebook/callback:
 *   get:
 *     summary: "Callback sau khi đăng nhập Facebook"
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: "Chuyển hướng về frontend với token"
 */
exports.facebookCallback = async (req, res) => {
  try {
    if (!req.user) {
      console.error("Facebook auth failed:", req.session.messages);
      return res.redirect(
        `${
          config.clientUrl
        }/login?error=auth_failed&message=${encodeURIComponent(
          req.session.messages?.[0] || "Xác thực Facebook thất bại"
        )}`
      );
    }

    const { email, displayName } = req.user;

    let existingUser = await User.findOne({ email });
    if (!existingUser) {
      existingUser = await User.create({
        name: displayName,
        email,
        password: crypto.randomBytes(20).toString("hex"),
        isEmailVerified: true,
        provider: "facebook",
      }).catch((err) => {
        console.error("Error creating Facebook user:", err);
        throw new Error("Không thể tạo người dùng mới");
      });
    } else if (existingUser.provider !== "facebook") {
      return res.redirect(
        `${
          config.clientUrl
        }/login?error=email_used&message=${encodeURIComponent(
          "Email đã được đăng ký bằng phương thức khác"
        )}`
      );
    }

    if (
      existingUser.status === "rejected" ||
      existingUser.status === "pending"
    ) {
      return res.redirect(
        `${
          config.clientUrl
        }/login?error=account_inactive&message=${encodeURIComponent(
          "Tài khoản chưa được kích hoạt hoặc bị từ chối"
        )}`
      );
    }

    const token = existingUser.getAccessToken();
    const refreshToken = existingUser.getRefreshToken();
    existingUser.refreshToken = refreshToken;
    await existingUser.save({ validateBeforeSave: false });

    res.cookie("token", token, { httpOnly: true });
    res.cookie("refreshToken", refreshToken, { httpOnly: true });

    res.redirect(
      `${config.clientUrl}/oauth?token=${token}&refreshToken=${refreshToken}`
    );
  } catch (error) {
    console.error("Facebook Callback error:", error);
    res.redirect(
      `${
        config.clientUrl
      }/login?error=server_error&message=${encodeURIComponent(
        error.message || "Lỗi server"
      )}`
    );
  }
};

/**
 * @swagger
 * /api/auth/register-partner:
 *   post:
 *     summary: "Đăng ký đối tác và tạo khách sạn"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *               - hotelName
 *               - hotelAddress
 *               - hotelDescription
 *               - locationId
 *               - hotelLocationDescription
 *               - hotelAmenities
 *               - hotelWebsite
 *               - checkInTime
 *               - checkOutTime
 *               - cancellationPolicy
 *               - childrenPolicy
 *               - petPolicy
 *               - smokingPolicy
 *     responses:
 *       201:
 *         description: "Đăng ký đối tác và khách sạn thành công"
 *       400:
 *         description: "Dữ liệu không hợp lệ hoặc email đã tồn tại"
 *       500:
 *         description: "Lỗi server khi đăng ký đối tác và khách sạn"
 */
exports.registerPartner = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      // Thông tin người dùng
      name,
      email,
      phone,

      // Thông tin khách sạn
      hotelName,
      hotelAddress,
      hotelDescription,
      locationId, // Thay thế hotelLocationName bằng locationId
      hotelLocationDescription,
      hotelAmenities,
      hotelWebsite,

      // Chính sách khách sạn
      checkInTime,
      checkOutTime,
      cancellationPolicy,
      childrenPolicy,
      petPolicy,
      smokingPolicy,
    } = req.body;

    // Kiểm tra các trường bắt buộc
    if (
      !name ||
      !email ||
      !phone ||
      !hotelName ||
      !hotelAddress ||
      !hotelDescription ||
      !locationId
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin người dùng và khách sạn",
      });
    }

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Email đã được sử dụng",
      });
    }

    // Xử lý tải lên hình ảnh
    let featuredImage = null;
    let hotelImages = [];

    // Xử lý ảnh đại diện (featuredImage)
    if (req.files && req.files.featuredImage) {
      try {
        console.log(
          "Featured image file:",
          JSON.stringify({
            originalname: req.files.featuredImage[0].originalname,
            mimetype: req.files.featuredImage[0].mimetype,
            size: req.files.featuredImage[0].size,
          })
        );

        const uploadedFeaturedImage = await cloudinaryService.uploadFromBuffer(
          req.files.featuredImage[0],
          "hotels"
        );

        console.log(
          "Cloudinary response for featured image:",
          JSON.stringify(uploadedFeaturedImage)
        );

        featuredImage = {
          url: uploadedFeaturedImage.url,
          publicId: uploadedFeaturedImage.publicId,
          filename: uploadedFeaturedImage.filename,
        };

        console.log(
          "Final featuredImage object:",
          JSON.stringify(featuredImage)
        );
      } catch (uploadError) {
        console.error("Error uploading featured image:", uploadError);
      }
    } else {
      console.log("No featured image provided in the request");
    }

    // Xử lý các ảnh khác của khách sạn (hotelImages)
    if (
      req.files &&
      req.files.hotelImages &&
      req.files.hotelImages.length > 0
    ) {
      try {
        console.log("Hotel images files count:", req.files.hotelImages.length);

        const uploadedHotelImages =
          await cloudinaryService.uploadManyFromBuffer(
            req.files.hotelImages,
            "hotels"
          );

        console.log(
          "Cloudinary response for hotel images:",
          JSON.stringify(uploadedHotelImages)
        );

        hotelImages = uploadedHotelImages.map((img) => ({
          url: img.url,
          publicId: img.publicId,
          filename: img.filename,
        }));

        console.log("Final hotelImages array:", JSON.stringify(hotelImages));
      } catch (uploadError) {
        console.error("Error uploading hotel images:", uploadError);
      }
    } else {
      console.log("No hotel images provided in the request");
    }

    // Tạo người dùng mới với vai trò 'partner'
    const user = await User.create(
      [
        {
          name,
          email,
          phone,
          password: crypto.randomBytes(10).toString("hex"), // Mật khẩu tạm thời ngẫu nhiên
          role: "partner",
          status: "pending", // Trạng thái chờ duyệt cho đối tác
          isEmailVerified: false,
        },
      ],
      { session }
    );

    const newUser = user[0];

    // Tạo khách sạn mới với ownerId là ID của người dùng vừa tạo
    const hotel = await Hotel.create(
      [
        {
          name: hotelName,
          address: hotelAddress,
          description: hotelDescription,
          locationId: locationId, // Sử dụng locationId thay vì locationName
          locationDescription: hotelLocationDescription,
          ownerId: newUser._id,
          website: hotelWebsite,
          featuredImage: featuredImage,
          images: hotelImages,
          amenities: hotelAmenities || [],
          policies: {
            checkInTime: checkInTime || "14:00",
            checkOutTime: checkOutTime || "12:00",
            cancellationPolicy: cancellationPolicy || "no-refund",
            childrenPolicy: childrenPolicy || "no",
            petPolicy: petPolicy || "no",
            smokingPolicy: smokingPolicy || "no",
          },
          status: "pending", // Trạng thái chờ duyệt
        },
      ],
      { session }
    );

    // Tạo token xác thực email
    const verificationToken = newUser.getVerificationToken();
    await newUser.save({ session, validateBeforeSave: false });

    // Tạo URL xác thực
    const verificationUrl = `${config.clientUrl}/verify-email/${verificationToken}`;

    // Nội dung email
    const message = `
      <h1>Xác nhận đăng ký tài khoản đối tác</h1>
      <p>Cảm ơn bạn đã đăng ký tài khoản đối tác tại hệ thống của chúng tôi.</p>
      <p>Vui lòng nhấn vào đường dẫn sau để xác nhận email của bạn:</p>
      <a href="${verificationUrl}" target="_blank">Xác nhận email</a>
      <p>Đường dẫn có hiệu lực trong 24 giờ.</p>
      <p>Sau khi được phê duyệt, bạn sẽ nhận được email thông báo kèm theo thông tin đăng nhập.</p>
    `;

    try {
      await sendEmail({
        email: newUser.email,
        subject: "Xác thực email đối tác",
        message,
      });
    } catch (err) {
      // Nếu có lỗi, xóa tất cả ảnh đã upload
      if (featuredImage && featuredImage.publicId) {
        await cloudinaryService.deleteFile(featuredImage.publicId);
      }

      if (hotelImages && hotelImages.length > 0) {
        const publicIds = hotelImages
          .map((img) => img.publicId)
          .filter((id) => id);
        if (publicIds.length > 0) {
          await cloudinaryService.deleteMany(publicIds);
        }
      }

      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message: "Không thể gửi email xác thực. Vui lòng thử lại sau",
      });
    }

    // Commit giao dịch nếu mọi thứ thành công
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          status: newUser.status,
        },
        hotel: hotel[0],
      },
      message:
        "Đăng ký đối tác và khách sạn thành công. Vui lòng kiểm tra email để xác thực.",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng ký đối tác và khách sạn",
    });
  }
});

/**
 * @swagger
 * /api/auth/approve-partner/{id}:
 *   put:
 *     summary: Phê duyệt tài khoản đối tác
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Đã phê duyệt tài khoản đối tác và gửi thông tin đăng nhập"
 *       404:
 *         description: "Không tìm thấy người dùng"
 *       500:
 *         description: "Lỗi server"
 */
exports.approvePartner = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    if (user.role !== "partner") {
      return res.status(400).json({
        success: false,
        message: "Người dùng không phải là đối tác",
      });
    }

    // Tạo mật khẩu ngẫu nhiên
    const plainPassword = crypto.randomBytes(6).toString("hex");
    user.password = plainPassword;
    user.status = "active";
    await user.save();

    // Cập nhật trạng thái khách sạn
    const hotel = await Hotel.findOne({ ownerId: user._id });
    if (hotel) {
      hotel.status = "active";
      await hotel.save();
    }

    // Gửi email thông báo kèm thông tin đăng nhập
    const message = `
      <h1>Tài khoản đối tác đã được phê duyệt</h1>
      <p>Chúc mừng! Tài khoản đối tác và khách sạn của bạn đã được phê duyệt.</p>
      <p>Bạn có thể đăng nhập và bắt đầu sử dụng các tính năng dành cho đối tác với thông tin sau:</p>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Mật khẩu:</strong> ${plainPassword}</p>
      <p>Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu để đảm bảo an toàn.</p>
    `;

    await sendEmail({
      email: user.email,
      subject: "Tài khoản đối tác đã được phê duyệt",
      message,
    });

    res.status(200).json({
      success: true,
      message: "Đã phê duyệt tài khoản đối tác và gửi thông tin đăng nhập",
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          status: user.status,
        },
        hotel: hotel
          ? {
              _id: hotel._id,
              name: hotel.name,
              status: hotel.status,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Lỗi phê duyệt đối tác:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/reject-partner/{id}:
 *   put:
 *     summary: Từ chối tài khoản đối tác
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Đã từ chối tài khoản đối tác"
 *       400:
 *         description: "Vui lòng cung cấp lý do từ chối"
 *       404:
 *         description: "Không tìm thấy người dùng"
 *       500:
 *         description: "Lỗi server"
 */
exports.rejectPartner = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp lý do từ chối",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    if (user.role !== "partner") {
      return res.status(400).json({
        success: false,
        message: "Người dùng không phải là đối tác",
      });
    }

    user.status = "rejected";
    await user.save();

    // Cập nhật trạng thái khách sạn
    const hotel = await Hotel.findOne({ ownerId: user._id });
    if (hotel) {
      hotel.status = "inactive";
      await hotel.save();
    }

    // Gửi email thông báo
    const message = `
      <h1>Tài khoản đối tác không được phê duyệt</h1>
      <p>Rất tiếc! Tài khoản đối tác của bạn chưa được phê duyệt.</p>
      <p><strong>Lý do:</strong> ${reason}</p>
      <p>Bạn có thể cập nhật thông tin và gửi lại yêu cầu.</p>
    `;

    await sendEmail({
      email: user.email,
      subject: "Tài khoản đối tác không được phê duyệt",
      message,
    });

    res.status(200).json({
      success: true,
      message: "Đã từ chối tài khoản đối tác",
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          status: user.status,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi từ chối đối tác:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/**
 * @swagger
 * /api/auth/pending-partners:
 *   get:
 *     summary: "Lấy danh sách đối tác chờ duyệt" 
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "Lấy danh sách đối tác chờ duyệt thành công"
 *       500:
 *         description: "Lỗi server"
 */
exports.getPendingPartners = async (req, res) => {
  try {
    const partners = await User.find({
      role: "partner",
      status: "pending",
    }).select("-password -refreshToken");

    // Lấy thông tin khách sạn tương ứng với mỗi đối tác
    const partnersWithHotels = await Promise.all(
      partners.map(async (partner) => {
        const hotel = await Hotel.findOne({
          ownerId: partner._id,
          status: "pending",
        }).populate("amenities");

        return {
          user: partner,
          hotel: hotel || null,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: partnersWithHotels.length,
      data: partnersWithHotels,
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách đối tác chờ duyệt:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};
