/**
 * Cache em memória com suporte a TTL (Time-To-Live)
 *
 * Padrão singleton para reutilização de dados em cache durante a requisição.
 * Evita múltiplas queries ao banco de dados para o mesmo recurso em curto período.
 *
 * Estrutura:
 * - key: identificador único (ex: "property:uuid")
 * - value: dados em cache
 * - expiresAt: timestamp de expiração (ms)
 * - etag: hash para validação HTTP 304
 */

import crypto from 'crypto'

class MemoryCache {
  constructor () {
    this.store = new Map()
    this.timers = new Map()
  }

  /**
   * Define valor em cache com TTL opcional
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds - segundos (default: 300s = 5min)
   * @returns {string} etag do valor armazenado
   */
  set (key, value, ttlSeconds = 300) {
    // Limpar timer anterior se existia
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
    }

    // Calcular ETag via SHA-256 do conteúdo
    const etag = this.generateETag(value)

    // Armazenar entrada
    const entry = {
      value,
      etag,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now()
    }
    this.store.set(key, entry)

    // Agendar limpeza automática
    const timer = setTimeout(() => {
      this.store.delete(key)
      this.timers.delete(key)
    }, ttlSeconds * 1000)
    this.timers.set(key, timer)

    return etag
  }

  /**
   * Obtém valor do cache se não expirou
   * @param {string} key
   * @returns {object|null} { value, etag } ou null se expirado/não existe
   */
  get (key) {
    const entry = this.store.get(key)

    if (!entry) return null

    // Verificar expiração
    if (Date.now() > entry.expiresAt) {
      this.delete(key)
      return null
    }

    return {
      value: entry.value,
      etag: entry.etag,
      age: Math.floor((Date.now() - entry.createdAt) / 1000)
    }
  }

  /**
   * Verifica se valor em cache é válido vs etag do cliente
   * @param {string} key
   * @param {string} clientETag - ETag do cliente (If-None-Match)
   * @returns {boolean} true se não mudou (304 Not Modified)
   */
  isStale (key, clientETag) {
    const entry = this.store.get(key)
    if (!entry) return true
    if (Date.now() > entry.expiresAt) return true
    return entry.etag !== clientETag
  }

  /**
   * Remove valor do cache
   * @param {string} key
   */
  delete (key) {
    this.store.delete(key)
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
      this.timers.delete(key)
    }
  }

  /**
   * Remove múltiplas entradas por padrão (ex: "property:*" limpa todas properties)
   * @param {string|RegExp} pattern
   */
  deletePattern (pattern) {
    const regex = typeof pattern === 'string'
      ? new RegExp(`^${pattern.replace('*', '.*')}$`)
      : pattern

    for (const [key] of this.store) {
      if (regex.test(key)) {
        this.delete(key)
      }
    }
  }

  /**
   * Limpa todo o cache
   */
  clear () {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.store.clear()
    this.timers.clear()
  }

  /**
   * Retorna estatísticas do cache
   */
  stats () {
    const entries = Array.from(this.store.entries())
    return {
      size: this.store.size,
      entries: entries.map(([key, entry]) => ({
        key,
        age: Math.floor((Date.now() - entry.createdAt) / 1000),
        ttl: Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000)),
        etag: entry.etag.substring(0, 8) + '...'
      }))
    }
  }

  /**
   * Gera ETag via SHA-256 do valor (serializado como JSON)
   * @private
   */
  generateETag (value) {
    const json = JSON.stringify(value)
    return `"${crypto.createHash('sha256').update(json).digest('hex').substring(0, 16)}"`
  }
}

// Singleton
const CACHE_SINGLETON_KEY = '__pocoshost_cache__'
const cache = globalThis[CACHE_SINGLETON_KEY] ??= new MemoryCache()

export default cache
