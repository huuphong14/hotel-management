const authController = require("../../controllers/authController");
const User = require("../../models/User");
const sendEmail = require("../../utils/sendEmail");
const { sendTokenResponse } = require("../../utils/tokenUtils");

jest.mock("../../models/User");
jest.mock("../../utils/sendEmail");
jest.mock("../../utils/tokenUtils", () => ({
  sendTokenResponse: jest.fn(),
}));

describe("authController.register", () => {
  it("should register user and send email", async () => {
    const req = {
      body: { name: "A", email: "a@email.com", password: "123456" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeUser = {
      getVerificationToken: jest.fn().mockReturnValue("token123"),
      save: jest.fn().mockResolvedValue(),
      email: "a@email.com",
    };
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(fakeUser);
    sendEmail.mockResolvedValue();

    await authController.register(req, res);

    expect(User.create).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it("should return 400 if missing fields", async () => {
    const req = { body: { name: "A", email: "a@email.com" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("authController.login", () => {
  it("should login successfully", async () => {
    const req = { body: { email: "a@email.com", password: "123456" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeUser = {
      isEmailVerified: true,
      status: "active",
      matchPassword: jest.fn().mockResolvedValue(true),
    };
    User.findOne.mockReturnValue({ select: () => Promise.resolve(fakeUser) });

    await authController.login(req, res);

    expect(sendTokenResponse).toHaveBeenCalled();
  });

  it("should return 400 if missing fields", async () => {
    const req = { body: { email: "a@email.com" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("authController.getMe", () => {
  it("should return user info", async () => {
    const req = { user: { id: "u1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const fakeUser = { _id: "u1", name: "A" };
    User.findById.mockResolvedValue(fakeUser);

    await authController.getMe(req, res);

    expect(User.findById).toHaveBeenCalledWith("u1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeUser })
    );
  });

  it("should return 500 on error", async () => {
    const req = { user: { id: "u1" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    User.findById.mockRejectedValue(new Error("DB error"));

    await authController.getMe(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});

describe("authController.logout", () => {
  it("should logout successfully", async () => {
    const req = { user: { id: "u1" } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
    };
    const fakeUser = { save: jest.fn().mockResolvedValue() };
    User.findById.mockResolvedValue(fakeUser);

    await authController.logout(req, res);

    expect(fakeUser.save).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it("should return 500 on error", async () => {
    const req = { user: { id: "u1" } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
    };
    User.findById.mockRejectedValue(new Error("DB error"));

    await authController.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});
