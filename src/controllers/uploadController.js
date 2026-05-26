import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

// Configuração do Cloudinary usando variáveis de ambiente
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Faz upload do buffer do arquivo (req.file.buffer) direto para o Cloudinary
 * usando upload_stream. Compatível com multer v1 e v2.
 */
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: 'pocoshost/uploads',
        transformation: [{ width: 1920, height: 1080, crop: 'limit' }],
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

export async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }

    const result = await uploadToCloudinary(req.file.buffer);

    res.status(201).json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error('[uploadController] Erro ao processar upload:', error?.message ?? error);

    // Cloudinary mal configurado (credenciais ausentes ou inválidas)
    if (error?.http_code === 401 || error?.message?.includes('Must supply api_key')) {
      return res.status(500).json({
        error: 'Serviço de upload temporariamente indisponível.',
      });
    }
    res.status(500).json({
      error: 'Falha ao processar o upload da imagem.',
    });
  }
}
