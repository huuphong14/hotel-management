const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Review = require("../../models/Review");
require("../../models/Hotel");

describe("Review Model", () => {
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
    await Review.deleteMany();
  });

  it("should create a valid review", async () => {
    const review = new Review({
      userId: new mongoose.Types.ObjectId(),
      hotelId: new mongoose.Types.ObjectId(),
      rating: 5,
      title: "Great!",
      comment: "Very good hotel!",
    });
    const saved = await review.save();
    expect(saved._id).toBeDefined();
    expect(saved.rating).toBe(5);
    expect(saved.title).toBe("Great!");
  });

  it("should not allow missing required fields", async () => {
    const review = new Review({});
    let err;
    try {
      await review.save();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.userId).toBeDefined();
    expect(err.errors.hotelId).toBeDefined();
    expect(err.errors.rating).toBeDefined();
    expect(err.errors.title).toBeDefined();
    expect(err.errors.comment).toBeDefined();
  });

  it("should validate rating between 1 and 5", async () => {
    const review = new Review({
      userId: new mongoose.Types.ObjectId(),
      hotelId: new mongoose.Types.ObjectId(),
      rating: 6,
      title: "Too high",
      comment: "Invalid",
    });
    let err;
    try {
      await review.save();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.rating).toBeDefined();
  });

  it("should call calculateAverageRating on save", async () => {
    const spy = jest
      .spyOn(Review, "calculateAverageRating")
      .mockImplementation(async () => {});
    const review = new Review({
      userId: new mongoose.Types.ObjectId(),
      hotelId: new mongoose.Types.ObjectId(),
      rating: 5,
      title: "Test",
      comment: "Test",
    });
    await review.save();
    expect(spy).toHaveBeenCalledWith(review.hotelId);
    spy.mockRestore();
  });

  it("should call calculateAverageRating on remove", async () => {
    const spy = jest
      .spyOn(Review, "calculateAverageRating")
      .mockImplementation(async () => {});
    const review = new Review({
      userId: new mongoose.Types.ObjectId(),
      hotelId: new mongoose.Types.ObjectId(),
      rating: 5,
      title: "Test",
      comment: "Test",
    });
    await review.save();
    await review.deleteOne();
    expect(spy).toHaveBeenCalledWith(review.hotelId);
    spy.mockRestore();
  });
});
