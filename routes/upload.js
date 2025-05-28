const express = require("express");
const router = express.Router();
const multer = require("multer");
const { uploadTinyMCEImage } = require("../controllers/postController");

// Cấu hình multer lưu vào memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Route upload TinyMCE
router.post("/tinymce", upload.single("file"), uploadTinyMCEImage);

module.exports = router;
