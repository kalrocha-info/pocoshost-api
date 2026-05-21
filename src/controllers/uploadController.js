export async function uploadImage(req, res) {
  try {
    // Se o middleware do multer passou, mas não há arquivo
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }
    
    // O arquivo já foi salvo no Cloudinary com segurança.
    // Retornamos a URL pública gerada para o frontend salvar no banco de dados.
    res.status(201).json({
      success: true,
      url: req.file.path,
      public_id: req.file.filename
    });
  } catch (error) {
    console.error('Erro no uploadController:', error);
    res.status(500).json({ error: 'Falha ao processar o upload da imagem.' });
  }
}
