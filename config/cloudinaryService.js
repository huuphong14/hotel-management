// utils/cloudinaryService.js
const cloudinary = require('cloudinary').v2;

// Cấu hình Cloudinary từ biến môi trường
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadFromBuffer = async (file, folder = 'hotels') => {
    // Đảm bảo folder là một trong ba loại cho phép
    const allowedFolders = ['users', 'hotels', 'rooms'];
    const targetFolder = allowedFolders.includes(folder) ? folder : 'others';

    return new Promise((resolve, reject) => {
        // Tạo stream từ buffer
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: targetFolder,
                resource_type: 'auto' // Cho phép upload các loại file khác nhau
            },
            (error, result) => {
                if (error) return reject(error);
                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    filename: file.originalname || 'unnamed'
                });
            }
        );

        // Chuyển buffer vào stream
        const bufferStream = require('stream').Readable.from(file.buffer);
        bufferStream.pipe(uploadStream);
    });
};

// Upload nhiều file cùng lúc
const uploadManyFromBuffer = async (files, folder = 'hotels') => {
    const uploadPromises = files.map(file => uploadFromBuffer(file, folder));
    return Promise.all(uploadPromises);
};

// Xóa file từ Cloudinary theo publicId
const deleteFile = async (publicId) => {
    if (!publicId) return null;
    return cloudinary.uploader.destroy(publicId);
};

// Xóa nhiều file cùng lúc
const deleteMany = async (publicIds) => {
    if (!publicIds || !publicIds.length) return null;
    const deletePromises = publicIds.map(id => deleteFile(id));
    return Promise.all(deletePromises);
};

// Tạo URL có biến đổi ảnh (resize, crop, etc.)
const transformImage = (url, options = {}) => {
    if (!url) return null;


    // Phân tích URL gốc
    const baseUrl = url.split('/upload/')[0] + '/upload/';
    const imagePath = url.split('/upload/')[1];

    // Tạo chuỗi transformation
    let transformations = '';

    if (options.width) transformations += `w_${options.width},`;
    if (options.height) transformations += `h_${options.height},`;
    if (options.crop) transformations += `c_${options.crop},`;
    if (options.quality) transformations += `q_${options.quality},`;

    // Loại bỏ dấu phẩy cuối cùng nếu có
    if (transformations.endsWith(',')) {
        transformations = transformations.slice(0, -1);
    }

    return transformations ? `${baseUrl}${transformations}/${imagePath}` : url;
};

module.exports = {
    uploadFromBuffer,
    uploadManyFromBuffer,
    deleteFile,
    deleteMany,
    transformImage
};