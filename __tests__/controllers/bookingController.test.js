const bookingController = require("../../controllers/bookingController");
const Booking = require("../../models/Booking");
const Room = require("../../models/Room");
const Hotel = require("../../models/Hotel");
const sendEmail = require("../../utils/sendEmail");
const NotificationService = require("../../services/notificationService");
const { validateVoucher } = require("../../services/voucherService");
const mongoose = require("mongoose");
const MockDate = require("mockdate");
const Payment = require("../../models/Payment");
const zaloPayService = require("../../services/zaloPayService");

jest.mock("../../models/Booking");
jest.mock("../../models/Room");
jest.mock("../../models/Hotel");
jest.mock("../../utils/sendEmail");
jest.mock("../../services/notificationService");
jest.mock("../../services/voucherService", () => ({
  validateVoucher: jest.fn(),
}));
jest.mock("../../models/Payment");
jest.mock("../../services/zaloPayService");

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
};
jest.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);

describe("bookingController.createBooking", () => {
  beforeEach(() => {
    Payment.updateMany.mockResolvedValue();
    zaloPayService.createPaymentUrl.mockResolvedValue("https://payment.url");
  });

  it("should create booking and return 201", async () => {
    const req = {
      user: { id: "u1" },
      body: {
        roomId: "r1",
        checkIn: "2024-07-01",
        checkOut: "2024-07-02",
        contactInfo: { name: "A", email: "a@email.com", phone: "123" },
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeRoom = { _id: "r1", price: 100, hotelId: "h1" };
    Room.findById.mockReturnValue({
      populate: () => ({ session: () => fakeRoom }),
    });
    const fakeBooking = {
      _id: "b1",
      room: {
        hotelId: { name: "Hotel A", address: "123 Street" },
        type: "Deluxe",
      },
      originalPrice: 100,
      finalPrice: 100,
      discountAmount: 0,
      voucher: null,
      checkIn: new Date("2024-07-01"),
      checkOut: new Date("2024-07-02"),
      contactInfo: { name: "A", email: "a@email.com", phone: "123" },
      populate: function () {
        return this;
      },
    };
    Booking.create.mockResolvedValue([fakeBooking]);
    validateVoucher.mockResolvedValue({ success: true, discountAmount: 0 });
    NotificationService.createBookingNotification.mockResolvedValue();
    sendEmail.mockResolvedValue();
    MockDate.set("2024-07-01T00:00:00Z");

    await bookingController.createBooking(req, res);

    MockDate.reset();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it("should return 400 if missing contact info", async () => {
    const req = {
      user: { id: "u1" },
      body: {
        roomId: "r1",
        checkIn: "2024-07-01",
        checkOut: "2024-07-02",
        contactInfo: {},
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await bookingController.createBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("bookingController.getMyBookings", () => {
  it("should return bookings for user", async () => {
    const req = { user: { id: "u1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeBookings = [{ _id: "b1" }, { _id: "b2" }];
    Booking.find.mockReturnValue({
      populate: () => ({ sort: () => fakeBookings }),
    });

    await bookingController.getMyBookings(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeBookings })
    );
  });

  it("should return 500 on error", async () => {
    const req = { user: { id: "u1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Booking.find.mockImplementation(() => {
      throw new Error("DB error");
    });

    await bookingController.getMyBookings(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("bookingController.updateBookingStatus", () => {
  it("should update booking status and return 200", async () => {
    const req = {
      params: { id: "b1" },
      body: { status: "confirmed" },
      user: { role: "admin" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeBooking = { _id: "b1", save: jest.fn() };
    Booking.findById.mockResolvedValue(fakeBooking);

    await bookingController.updateBookingStatus(req, res);

    expect(fakeBooking.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeBooking })
    );
  });

  it("should return 404 if booking not found", async () => {
    const req = {
      params: { id: "b1" },
      body: { status: "confirmed" },
      user: { role: "admin" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Booking.findById.mockResolvedValue(null);

    await bookingController.updateBookingStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("bookingController.getBookingDetails", () => {
  it("should return booking details", async () => {
    const req = { params: { id: "b1" }, user: { id: "u1", role: "admin" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeBooking = {
      _id: "b1",
      user: { _id: "u1" },
      room: { hotelId: { _id: "h1" } },
    };
    Booking.findById.mockReturnValue({ populate: () => fakeBooking });

    await bookingController.getBookingDetails(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeBooking })
    );
  });

  it("should return 404 if booking not found", async () => {
    const req = { params: { id: "b1" }, user: { id: "u1", role: "admin" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Booking.findById.mockReturnValue({ populate: () => null });

    await bookingController.getBookingDetails(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});
