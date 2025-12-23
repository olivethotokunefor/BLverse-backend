const cloudinary = require('cloudinary').v2;
const path = require('path');
const Media = require('../models/Media');

// Configure Cloudinary via environment variables
(function configureCloudinary() {
  try {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
  } catch (e) {
    // ignore; will fail during upload if not configured
  }
})();

function pickResourceType(mime) {
  if (!mime) return 'image';
  if (mime.startsWith('image/')) return 'image';
  // Cloudinary requires resource_type "video" for audio and videos
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'video';
  return 'raw';
}

function sanitizePublicId(name) {
  return String(name || 'upload').replace(/[^a-zA-Z0-9_-]/g, '_');
}

exports.uploadMedia = async (req, res) => {
  try {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER_MEDIA } = process.env;
    if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
      return res.status(500).json({ message: 'Cloud storage not configured' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const mime = req.file.mimetype || 'application/octet-stream';
    const resourceType = pickResourceType(mime);
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const base = sanitizePublicId(path.basename(req.file.originalname || 'upload', ext));
    const publicId = `${Date.now()}_${base}`;
    const folder = CLOUDINARY_FOLDER_MEDIA || 'blverse/media';

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType, public_id: publicId },
        (err, data) => (err ? reject(err) : resolve(data))
      );
      stream.end(req.file.buffer);
    });

    const doc = await Media.create({
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      format: result.format || '',
      bytes: result.bytes || 0,
      duration: result.duration || 0,
      width: result.width || 0,
      height: result.height || 0,
      createdBy: req.user ? req.user.id : undefined,
    });

    return res.status(201).json({
      id: String(doc._id),
      url: doc.url,
      public_id: doc.publicId,
      resource_type: doc.resourceType,
      format: doc.format,
      bytes: doc.bytes,
      duration: doc.duration,
      width: doc.width,
      height: doc.height,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    const message = (err && err.message) || 'Upload failed';
    return res.status(500).json({ message });
  }
};

// Simple connectivity test to Cloudinary using a known demo image URL
exports.cloudinaryTest = async (req, res) => {
  try {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER_MEDIA } = process.env;
    if (!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
      return res.status(500).json({ message: 'Cloudinary env vars missing' });
    }

    const folder = CLOUDINARY_FOLDER_MEDIA || 'blverse/media';
    const publicId = `cloudinary_test_${Date.now()}`;
    const testUrl = 'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg';

    const result = await cloudinary.uploader.upload(testUrl, {
      folder,
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
    });

    const optimizeUrl = cloudinary.url(result.public_id, {
      fetch_format: 'auto',
      quality: 'auto',
      secure: true,
    });

    const autoCropUrl = cloudinary.url(result.public_id, {
      crop: 'auto',
      gravity: 'auto',
      width: 500,
      height: 500,
      secure: true,
    });

    return res.json({
      ok: true,
      uploaded: {
        secure_url: result.secure_url,
        public_id: result.public_id,
        resource_type: result.resource_type,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
      },
      optimizeUrl,
      autoCropUrl,
    });
  } catch (err) {
    return res.status(500).json({ message: (err && err.message) || 'Cloudinary test failed' });
  }
};
