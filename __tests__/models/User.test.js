const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const User = require("../../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

describe("User Model", () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), { dbName: "test" });

    // Mock biến môi trường cho JWT
    process.env.JWT_ACCESS_SECRET = "test_access_secret";
    process.env.JWT_ACCESS_EXPIRE = "1h";
    process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
    process.env.JWT_REFRESH_EXPIRE = "7d";
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await User.deleteMany();
  });

  it("should hash password before saving", async () => {
    const user = new User({
      name: "A",
      email: "a@email.com",
      password: "123456",
    });
    await user.save();
    expect(user.password).not.toBe("123456");
    const isMatch = await bcrypt.compare("123456", user.password);
    expect(isMatch).toBe(true);
  });

  it("should match password correctly", async () => {
    const user = new User({
      name: "B",
      email: "b@email.com",
      password: "abcdef",
    });
    await user.save();
    const isMatch = await user.matchPassword("abcdef");
    expect(isMatch).toBe(true);
    const isNotMatch = await user.matchPassword("wrongpass");
    expect(isNotMatch).toBe(false);
  });

  it("should generate access token", async () => {
    const user = new User({
      name: "C",
      email: "c@email.com",
      password: "123456",
    });
    await user.save();
    const token = user.getAccessToken();
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    expect(decoded.id).toEqual(user._id.toString());
    expect(decoded.role).toEqual(user.role);
  });

  it("should generate refresh token", async () => {
    const user = new User({
      name: "D",
      email: "d@email.com",
      password: "123456",
    });
    await user.save();
    const token = user.getRefreshToken();
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    expect(decoded.id).toEqual(user._id.toString());
  });

  it("should generate verification token and set fields", async () => {
    const user = new User({
      name: "E",
      email: "e@email.com",
      password: "123456",
    });
    const token = user.getVerificationToken();
    expect(token).toBeDefined();
    expect(user.verificationToken).toHaveLength(64); // sha256 hex string
    expect(user.verificationTokenExpire).toBeInstanceOf(Date);
  });
});
