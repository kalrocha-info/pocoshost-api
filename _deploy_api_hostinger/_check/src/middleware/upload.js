import multer from 'multer';

// Usa memoryStorage: o arquivo fica em RAM (req.file.buffer)
// em vez de depender do multer-storage-cloudinary (incompatível com multer v2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB por arquivo
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Apenas JPG, PNG e WEBP são aceitos.'));
    }
  },
});

export default upload;
