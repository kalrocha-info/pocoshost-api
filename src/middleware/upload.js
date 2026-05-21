import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configuração do Cloudinary usando variáveis de ambiente
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuração do destino na Nuvem (Storage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pocoshost/uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    // Opcional: Redimensiona imagens muito grandes automaticamente para economizar banda
    transformation: [{ width: 1920, height: 1080, crop: 'limit' }] 
  },
});

// Configuração do Multer (Interceptador e Validador de Segurança)
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limite de 5MB por arquivo
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Apenas JPG, PNG e WEBP são aceitos.'));
    }
  }
});

export default upload;
