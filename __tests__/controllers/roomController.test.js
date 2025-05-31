const roomController = require("../../controllers/roomController");
const Room = require("../../models/Room");
const Hotel = require("../../models/Hotel");
const Booking = require("../../models/Booking");
const Amenity = require("../../models/Amenity");
const cloudinaryService = require("../../config/cloudinaryService");
const { updateHotelLowestPrice } = require("../../utils/hotelHelpers");

jest.mock("../../models/Room");
jest.mock("../../models/Hotel");
jest.mock("../../models/Booking");
jest.mock("../../models/Amenity");
jest.mock("../../config/cloudinaryService");
jest.mock("../../utils/hotelHelpers", () => ({
  updateHotelLowestPrice: jest.fn(),
}));

describe("roomController.createRoom", () => {
  it("should create room and return 201", async () => {
    const req = {
      params: { hotelId: "h1" },
      user: { id: "owner1" },
      body: { name: "Room 1", price: 100, capacity: 2, amenities: "[]" },
      files: [],
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeHotel = { _id: "h1", ownerId: { toString: () => "owner1" } };
    Hotel.findById.mockResolvedValue(fakeHotel);
    Amenity.find.mockResolvedValue([]);
    Room.create.mockResolvedValue({ _id: "r1", name: "Room 1" });

    await roomController.createRoom(req, res);

    expect(Room.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it("should return 404 if hotel not found", async () => {
    const req = {
      params: { hotelId: "h1" },
      user: { id: "owner1" },
      body: {},
      files: [],
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Hotel.findById.mockResolvedValue(null);

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("roomController.getRoom", () => {
  it("should return room by id", async () => {
    const req = { params: { id: "r1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeRoom = { _id: "r1", name: "Room 1" };
    Room.findById.mockReturnValue({
      populate: () => ({ populate: () => fakeRoom }),
    });

    await roomController.getRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeRoom })
    );
  });

  it("should return 404 if room not found", async () => {
    const req = { params: { id: "r1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Room.findById.mockReturnValue({
      populate: () => ({ populate: () => null }),
    });

    await roomController.getRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("roomController.getRooms", () => {
  it("should return rooms with pagination", async () => {
    const req = { params: { hotelId: "h1" }, query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeRooms = [{ _id: "r1", name: "Room 1" }];
    Room.find.mockReturnValue({
      populate: () => ({
        populate: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => fakeRooms,
            }),
          }),
        }),
      }),
    });
    Room.countDocuments.mockResolvedValue(1);

    await roomController.getRooms(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        count: 1,
        data: expect.any(Array),
      })
    );
  });

  it("should return 500 on error", async () => {
    const req = { params: { hotelId: "h1" }, query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Room.find.mockImplementation(() => {
      throw new Error("DB error");
    });

    await roomController.getRooms(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("roomController.updateRoom", () => {
  it("should update room and return 200", async () => {
    const req = {
      params: { id: "r1" },
      user: { id: "owner1", role: "partner" },
      body: {},
      files: [],
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeRoom = { _id: "r1", hotelId: "h1", images: [] };
    const fakeHotel = { _id: "h1", ownerId: { toString: () => "owner1" } };
    Room.findById.mockResolvedValue(fakeRoom);
    Hotel.findById.mockResolvedValue(fakeHotel);
    Room.findByIdAndUpdate.mockReturnValue({
      populate: () => fakeRoom,
    });

    await roomController.updateRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeRoom })
    );
  });

  it("should return 404 if room not found", async () => {
    const req = {
      params: { id: "r1" },
      user: { id: "owner1", role: "partner" },
      body: {},
      files: [],
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Room.findById.mockResolvedValue(null);

    await roomController.updateRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("roomController.deleteRoom", () => {
  it("should delete room and return 200", async () => {
    const req = {
      params: { id: "r1" },
      user: { id: "owner1", role: "partner" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeRoom = {
      _id: "r1",
      hotelId: "h1",
      images: [],
      deleteOne: jest.fn(),
    };
    const fakeHotel = { _id: "h1", ownerId: { toString: () => "owner1" } };
    Room.findById.mockResolvedValue(fakeRoom);
    Hotel.findById.mockResolvedValue(fakeHotel);
    Booking.exists.mockResolvedValue(false);

    await roomController.deleteRoom(req, res);

    expect(fakeRoom.deleteOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it("should return 404 if room not found", async () => {
    const req = {
      params: { id: "r1" },
      user: { id: "owner1", role: "partner" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Room.findById.mockResolvedValue(null);

    await roomController.deleteRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});
