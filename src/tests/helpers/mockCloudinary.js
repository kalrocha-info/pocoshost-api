import { vi } from 'vitest'

export const cloudinaryConfigSpy = vi.fn()
export const uploadStreamSpy = vi.fn()

vi.mock('cloudinary', () => ({
  v2: {
    config: cloudinaryConfigSpy,
    uploader: {
      upload_stream: uploadStreamSpy
    }
  }
}))
