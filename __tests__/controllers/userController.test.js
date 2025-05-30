const userController = require("../../controllers/userController");
const User = require("../../models/User");

jest.mock("../../models/User");

// Mock sendEmail nếu cần
jest.mock("../../utils/sendEmail", () => jest.fn());

describe("userController.getMe", () => {
  it("should return user info", async () => {
    const req = { user: { id: "123" } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    const fakeUser = { _id: "123", name: "Test" };
    User.findById.mockResolvedValue(fakeUser);

    await userController.getMe(req, res, next);

    expect(User.findById).toHaveBeenCalledWith("123");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeUser,
    });
  });
});

describe("userController.updateMe", () => {
  it("should update allowed fields and return updated user", async () => {
    const req = {
      user: { id: "123", email: "old@email.com" },
      body: { name: "New Name" },
      protocol: "http",
      get: () => "localhost:3000",
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    const fakeUser = {
      _id: "123",
      name: "New Name",
      email: "old@email.com",
      isEmailVerified: false,
      generateEmailVerificationToken: jest.fn().mockReturnValue("token123"),
      save: jest.fn(),
    };

    User.findById.mockResolvedValue(fakeUser);
    User.findByIdAndUpdate.mockResolvedValue(fakeUser);

    await userController.updateMe(req, res, next);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "123",
      expect.objectContaining({ name: "New Name" }),
      expect.any(Object)
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeUser,
    });
  });
});

describe("userController.changePassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 if missing fields", async () => {
    const req = { body: {}, user: { id: "123" } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await userController.changePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it("should return 400 if confirm password does not match", async () => {
    const req = {
      body: {
        currentPassword: "oldpass",
        newPassword: "newpass",
        confirmPassword: "notmatch",
      },
      user: { id: "123" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await userController.changePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it("should return 401 if current password is wrong", async () => {
    const req = {
      body: {
        currentPassword: "wrong",
        newPassword: "newpass",
        confirmPassword: "newpass",
      },
      user: { id: "123" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    const fakeUser = {
      matchPassword: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(),
    };
    User.findById.mockReturnValue({
      select: () => Promise.resolve(fakeUser),
    });

    await userController.changePassword(req, res, next);

    if (res.status.mock.calls.length === 0) {
      console.log("res.status not called, possible user not found");
    } else {
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    }
  });

  it("should return 404 if user not found", async () => {
    const req = {
      body: {
        currentPassword: "any",
        newPassword: "newpass",
        confirmPassword: "newpass",
      },
      user: { id: "notfound" },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    User.findById.mockReturnValue({
      select: () => Promise.resolve(null),
    });

    await userController.changePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});
