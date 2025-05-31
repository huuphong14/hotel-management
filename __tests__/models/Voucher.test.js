const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Voucher = require("../../models/Voucher");

describe("Voucher Model", () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), { dbName: "test" });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Voucher.deleteMany();
  });

  it("should create a valid voucher", async () => {
    const voucher = new Voucher({
      code: "abc123",
      discount: 10,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "fixed",
    });
    const saved = await voucher.save();
    expect(saved._id).toBeDefined();
    expect(saved.code).toBe("ABC123");
    expect(saved.discount).toBe(10);
    expect(saved.discountType).toBe("fixed");
  });

  it("should not allow missing required fields", async () => {
    const voucher = new Voucher({});
    let err;
    try {
      await voucher.save();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.code).toBeDefined();
    expect(err.errors.discount).toBeDefined();
    expect(err.errors.expiryDate).toBeDefined();
    expect(err.errors.discountType).toBeDefined();
  });

  it("should not allow discountType other than fixed or percentage", async () => {
    const voucher = new Voucher({
      code: "test",
      discount: 10,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "invalid",
    });
    let err;
    try {
      await voucher.save();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.discountType).toBeDefined();
  });

  it("should limit percentage discount to 100", async () => {
    const voucher = new Voucher({
      code: "test2",
      discount: 150,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "percentage",
    });
    await voucher.save();
    expect(voucher.discount).toBe(100);
  });

  it("should remove maxDiscount if discountType is fixed", async () => {
    const voucher = new Voucher({
      code: "test3",
      discount: 50,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "fixed",
      maxDiscount: 100,
    });
    await voucher.save();
    expect(voucher.maxDiscount).toBeNull();
  });

  it("should set startDate to expiryDate if startDate > expiryDate", async () => {
    const start = new Date(Date.now() + 1000000);
    const end = new Date();
    const voucher = new Voucher({
      code: "test4",
      discount: 10,
      startDate: start,
      expiryDate: end,
      discountType: "fixed",
    });
    await voucher.save();
    expect(voucher.startDate.getTime()).toBe(voucher.expiryDate.getTime());
  });

  it("should calculate discount correctly for fixed type", async () => {
    const voucher = new Voucher({
      code: "test5",
      discount: 20,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "fixed",
    });
    await voucher.save();
    expect(voucher.calculateDiscount(1000)).toBe(20);
  });

  it("should calculate discount correctly for percentage type", async () => {
    const voucher = new Voucher({
      code: "test6",
      discount: 10,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "percentage",
    });
    await voucher.save();
    expect(voucher.calculateDiscount(1000)).toBe(100);
  });

  it("should not exceed maxDiscount for percentage type", async () => {
    const voucher = new Voucher({
      code: "test7",
      discount: 50,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "percentage",
      maxDiscount: 100,
    });
    await voucher.save();
    expect(voucher.calculateDiscount(1000)).toBe(100);
  });

  it("should increment usageCount", async () => {
    const voucher = new Voucher({
      code: "test8",
      discount: 10,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000000),
      discountType: "fixed",
    });
    await voucher.save();
    await voucher.incrementUsage();
    const updated = await Voucher.findById(voucher._id);
    expect(updated.usageCount).toBe(1);
  });
});
