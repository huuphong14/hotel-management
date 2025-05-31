const mongoose = require("mongoose");
const Hotel = require("../../models/Hotel");

describe("Hotel Model", () => {
  it("should throw validation error if required fields are missing", async () => {
    const hotel = new Hotel({});
    let err;
    try {
      await hotel.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.name).toBeDefined();
    expect(err.errors.address).toBeDefined();
    expect(err.errors.locationId).toBeDefined();
    expect(err.errors.description).toBeDefined();
    expect(err.errors.ownerId).toBeDefined();
  });

  it("should set default values for rating, status, favoriteCount, lowestPrice, lowestDiscountedPrice, highestDiscountPercent", () => {
    const hotel = new Hotel({
      name: "Hotel A",
      address: "123 ABC Street",
      locationId: new mongoose.Types.ObjectId(),
      description: "Description",
      ownerId: "user1",
    });
    expect(hotel.rating).toBe(0);
    expect(hotel.status).toBe("pending");
    expect(hotel.favoriteCount).toBe(0);
    expect(hotel.lowestPrice).toBe(0);
    expect(hotel.lowestDiscountedPrice).toBe(0);
    expect(hotel.highestDiscountPercent).toBe(0);
  });

  it("should throw validation error if rating is out of min/max range", async () => {
    const hotel = new Hotel({
      name: "Hotel B",
      address: "123 DEF Street",
      locationId: new mongoose.Types.ObjectId(),
      description: "Description",
      ownerId: "user2",
      rating: 6,
    });
    let err;
    try {
      await hotel.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.rating).toBeDefined();
  });

  it("should throw validation error if highestDiscountPercent is greater than 100", async () => {
    const hotel = new Hotel({
      name: "Hotel C",
      address: "123 GHI Street",
      locationId: new mongoose.Types.ObjectId(),
      description: "Description",
      ownerId: "user3",
      highestDiscountPercent: 120,
    });
    let err;
    try {
      await hotel.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.highestDiscountPercent).toBeDefined();
  });

  it("should throw validation error if status is not in enum", async () => {
    const hotel = new Hotel({
      name: "Hotel D",
      address: "123 JKL Street",
      locationId: new mongoose.Types.ObjectId(),
      description: "Description",
      ownerId: "user4",
      status: "deleted",
    });
    let err;
    try {
      await hotel.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors.status).toBeDefined();
  });

  it("should have text index on name field", () => {
    const indexes = Hotel.schema.indexes();
    const hasTextIndex = indexes.some((idx) => idx[0].name === "text");
    expect(hasTextIndex).toBe(true);
  });
});
