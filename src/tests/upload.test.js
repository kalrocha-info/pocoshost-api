import { Writable } from 'node:stream'
import request from 'supertest'
import { createApp } from '../testApp.js'
import { createUser } from './helpers/factories.js'
import { uploadStreamSpy } from './helpers/mockCloudinary.js'

const app = createApp()

function mockUploadResult (result, error = null) {
  uploadStreamSpy.mockImplementation((_options, callback) => {
    const stream = new Writable({
      write (_chunk, _encoding, done) {
        done()
      }
    })
    stream.on('finish', () => callback(error, result))
    return stream
  })
}

describe('UPLOAD — /api/upload/image', () => {
  beforeEach(() => {
    uploadStreamSpy.mockReset()
  })

  it('rejects unauthenticated uploads', async () => {
    const res = await request(app)
      .post('/api/upload/image')
      .attach('image', Buffer.from('image'), {
        filename: 'image.jpg',
        contentType: 'image/jpeg'
      })

    expect(res.status).toBe(401)
  })

  it('rejects requests without an image', async () => {
    const guest = await createUser()
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${guest.token}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/nenhuma imagem/i)
  })

  it('rejects unsupported file formats', async () => {
    const guest = await createUser()
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${guest.token}`)
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'payload.txt',
        contentType: 'text/plain'
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/formato de arquivo não suportado/i)
  })

  it('uploads an image through Cloudinary', async () => {
    mockUploadResult({
      secure_url: 'https://images.example.test/pocoshost/image.jpg',
      public_id: 'pocoshost/uploads/image'
    })
    const guest = await createUser()
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${guest.token}`)
      .attach('image', Buffer.from('image-content'), {
        filename: 'image.jpg',
        contentType: 'image/jpeg'
      })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      success: true,
      url: 'https://images.example.test/pocoshost/image.jpg',
      public_id: 'pocoshost/uploads/image'
    })
    expect(uploadStreamSpy).toHaveBeenCalledOnce()
  })

  it('sanitizes Cloudinary authentication failures', async () => {
    mockUploadResult(null, { http_code: 401, message: 'invalid api key' })
    const guest = await createUser()
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${guest.token}`)
      .attach('image', Buffer.from('image-content'), {
        filename: 'image.png',
        contentType: 'image/png'
      })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Serviço de upload temporariamente indisponível.' })
  })

  it('returns a generic error for unexpected upload failures', async () => {
    mockUploadResult(null, new Error('unexpected provider failure'))
    const guest = await createUser()
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${guest.token}`)
      .attach('image', Buffer.from('image-content'), {
        filename: 'image.webp',
        contentType: 'image/webp'
      })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Falha ao processar o upload da imagem.' })
  })
})
