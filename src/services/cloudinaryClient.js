import { v2 as cloudinary } from 'cloudinary'

/**
 * Cliente Cloudinary (Singleton Pattern)
 *
 * Configura o Cloudinary uma única vez no carregamento do módulo
 * e reutiliza a mesma instância em toda a aplicação.
 * Evita múltiplas configurações e inicializações desnecessárias.
 */

const CLOUDINARY_SINGLETON_KEY = '__pocoshost_cloudinary_configured__'

if (!globalThis[CLOUDINARY_SINGLETON_KEY]) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  })
  globalThis[CLOUDINARY_SINGLETON_KEY] = true
}

export default cloudinary
