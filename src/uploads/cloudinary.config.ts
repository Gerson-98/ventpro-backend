import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export function getCloudinaryStorage() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'ventpro/designs',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
      transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
    },
  });
}
