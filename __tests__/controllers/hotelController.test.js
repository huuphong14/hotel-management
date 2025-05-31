const hotelController = require("../../controllers/hotelController");
const Hotel = require("../../models/Hotel");
const cloudinaryService = require("../../config/cloudinaryService");

jest.mock("../../models/Hotel");
jest.mock("../../config/cloudinaryService");

describe("hotelController.createHotel", () => {
  it("should create hotel and return 201", async () => {
    const req = {
      user: { id: "user123" },
      body: { name: "Hotel A", address: "123 Street", locationId: "loc1" },
      files: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const fakeHotel = { _id: "hotel1", name: "Hotel A" };
    Hotel.create.mockResolvedValue(fakeHotel);

    await hotelController.createHotel(req, res);

    expect(Hotel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Hotel A",
        address: "123 Street",
        locationId: "loc1",
        ownerId: "user123",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeHotel,
    });
  });

  it("should return 500 on error", async () => {
    const req = {
      user: { id: "user123" },
      body: { name: "Hotel A", address: "123 Street", locationId: "loc1" },
      files: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    Hotel.create.mockRejectedValue(new Error("DB error"));

    await hotelController.createHotel(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Lỗi server",
    });
  });
});

describe("hotelController.getMyHotels", () => {
  it("should return hotels for partner", async () => {
    const req = {
      user: { id: "user123", role: "partner" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const fakeHotels = [{ _id: "h1" }, { _id: "h2" }];
    Hotel.find.mockResolvedValue(fakeHotels);

    await hotelController.getMyHotels(req, res);

    expect(Hotel.find).toHaveBeenCalledWith({ ownerId: "user123" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      count: 2,
      data: fakeHotels,
    });
  });

  it("should return 403 if not partner", async () => {
    const req = {
      user: { id: "user123", role: "customer" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await hotelController.getMyHotels(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Chỉ đối tác mới có thể xem danh sách khách sạn của mình",
    });
  });
});

describe("hotelController.getHotels", () => {
  it("should return 500 on error", async () => {
    const req = { query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Hotel.find.mockImplementation(() => {
      throw new Error("DB error");
    });

    await hotelController.getHotels(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("hotelController.getHotel", () => {
  it("should return hotel by id", async () => {
    const req = { params: { id: "h1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeHotel = { _id: "h1", name: "Hotel 1" };
    Hotel.findById.mockReturnValue({
      populate: () => ({ populate: () => fakeHotel }),
    });

    await hotelController.getHotel(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeHotel })
    );
  });

  it("should return 404 if hotel not found", async () => {
    const req = { params: { id: "h1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Hotel.findById.mockReturnValue({
      populate: () => ({ populate: () => null }),
    });

    await hotelController.getHotel(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("hotelController.updateHotel", () => {
  it("should update hotel and return 200", async () => {
    const req = {
      params: { id: "h1" },
      user: { id: "owner1", role: "partner" },
      body: {},
      files: {},
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeHotel = { _id: "h1", ownerId: { toString: () => "owner1" } };
    Hotel.findById.mockResolvedValue(fakeHotel);
    Hotel.findByIdAndUpdate.mockResolvedValue(fakeHotel);

    await hotelController.updateHotel(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeHotel })
    );
  });

  it("should return 404 if hotel not found", async () => {
    const req = {
      params: { id: "h1" },
      user: { id: "owner1", role: "partner" },
      body: {},
      files: {},
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Hotel.findById.mockResolvedValue(null);

    await hotelController.updateHotel(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("hotelController.deleteHotel", () => {
  it("should delete hotel and return 200", async () => {
    const req = {
      params: { id: "h1" },
      user: { id: "owner1", role: "partner" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeHotel = {
      _id: "h1",
      ownerId: { toString: () => "owner1" },
      deleteOne: jest.fn(),
    };
    Hotel.findById.mockResolvedValue(fakeHotel);

    await hotelController.deleteHotel(req, res);

    expect(fakeHotel.deleteOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it("should return 404 if hotel not found", async () => {
    const req = {
      params: { id: "h1" },
      user: { id: "owner1", role: "partner" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    Hotel.findById.mockResolvedValue(null);

    await hotelController.deleteHotel(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});
