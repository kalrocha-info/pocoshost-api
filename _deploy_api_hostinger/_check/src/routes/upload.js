import { Router } from 'express';
import { uploadImage } from '../controllers/uploadController.js';
import upload from '../middleware/upload.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

// Rota protegida: Apenas usuários logados podem enviar fotos
// upload.single('image') espera que o frontend envie o arquivo num campo chamado "image"
router.post('/image', authRequired, upload.single('image'), uploadImage);

// Handlers de erro específicos do Multer (ex: arquivo muito grande)
router.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'O arquivo excede o limite de 5MB.' });
    }
    return res.status(400).json({ error: 'Erro no upload da imagem.' });
  } else if (err) {
    return res.status(400).json({ error: 'Formato de arquivo não suportado. Apenas JPG, PNG e WEBP são aceitos.' });
  }
  next();
});

export default router;
