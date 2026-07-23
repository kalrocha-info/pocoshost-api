/**
 * Middleware para aplicar headers HTTP de cache
 *
 * Estratégias:
 * 1. ETag (entidade tag): hash do conteúdo para validação 304 Not Modified
 * 2. Cache-Control: diretrizes de caching (max-age, public/private, etc)
 * 3. Last-Modified: para invalidação baseada em tempo
 *
 * Segue RFC 7232 (HTTP Conditional Requests) e RFC 7234 (HTTP Caching)
 */

import cache from '../utils/cache.js'

/**
 * Políticas de cache por tipo de endpoint
 */
const CACHE_POLICIES = {
  // Dados imutáveis ou raramente mudam
  immutable: { maxAge: 86400, policy: 'public, immutable' }, // 24h
  // Dados que mudam ocasionalmente
  stable: { maxAge: 3600, policy: 'public' }, // 1h
  // Dados que mudam frequentemente
  volatile: { maxAge: 300, policy: 'private' }, // 5min
  // Sem cache
  nocache: { maxAge: 0, policy: 'no-store, no-cache, must-revalidate' }
}

/**
 * Middleware para aplicar headers de cache e validar ETags
 * @param {string} cacheType - 'immutable' | 'stable' | 'volatile' | 'nocache'
 * @param {number} ttlSeconds - override de TTL (default: usar policy)
 */
export function cacheHeaders (cacheType = 'volatile', ttlSeconds = null) {
  return (req, res, next) => {
    const policy = CACHE_POLICIES[cacheType] || CACHE_POLICIES.volatile
    const maxAge = ttlSeconds || policy.maxAge

    // Armazenar original res.json para interceptar resposta
    const originalJson = res.json.bind(res)
    res.json = function (data) {
      // Gerar ETag do payload
      const cacheKey = `http:${req.path}:${JSON.stringify(req.query || {})}`
      const etag = cache.set(cacheKey, data, maxAge)

      // Setar headers de cache
      res.set('ETag', etag)
      res.set('Cache-Control', `${policy.policy}, max-age=${maxAge}`)
      res.set('Last-Modified', new Date().toUTCString())
      res.set('Vary', 'Accept-Encoding')

      // Verificar If-None-Match (client ETag validation)
      const ifNoneMatch = req.get('if-none-match')
      if (ifNoneMatch && ifNoneMatch === etag) {
        // 304 Not Modified: cliente tem versão atual
        res.status(304).end()
        return res
      }

      // Responder com dados completos
      return originalJson(data)
    }

    next()
  }
}

/**
 * Middleware para validar ETag antes de operações (PUT, PATCH, DELETE)
 * Previne conflitos de concorrência tipo "lost update"
 *
 * Uso: router.patch('/resource/:id', validateETag, updateController)
 */
export function validateETag (req, res, next) {
  const ifMatch = req.get('if-match')
  const resourceId = req.params.id

  if (!ifMatch) {
    // ETag obrigatório para modificações
    return res.status(428).json({
      error: 'Precondition Required',
      message: 'Header If-Match (ETag) é obrigatório para modificações'
    })
  }

  // Verificar se ETag corresponde
  const cached = cache.get(`resource:${resourceId}`)
  if (!cached || cached.etag !== ifMatch) {
    // 412 Precondition Failed: versão desatualizada
    return res.status(412).json({
      error: 'Precondition Failed',
      message: 'Recurso foi modificado. Recarregue antes de atualizar.'
    })
  }

  next()
}

/**
 * Middleware para aplicar cache baseado em padrões de rota
 *
 * Uso:
 *   router.get('/properties', applyRouteCache('properties', 'stable'))
 */
export function applyRouteCache (cacheKey, cacheType = 'volatile') {
  return (req, res, next) => {
    // Verificar se está em cache
    const cached = cache.get(`route:${cacheKey}:${JSON.stringify(req.query)}`)
    if (cached) {
      res.set('ETag', cached.etag)
      res.set('Cache-Control', CACHE_POLICIES[cacheType].policy)
      res.set('X-Cache', 'HIT')
      return res.json(cached.value)
    }

    // Se não está em cache, deixar controller proceder e cache vai capturar na saída
    res.set('X-Cache', 'MISS')
    next()
  }
}

/**
 * Middleware para invalidar cache de padrões (ex: ao atualizar property, limpar cache de properties)
 *
 * Uso:
 *   router.patch('/properties/:id', invalidateCache('properties:*'), updateController)
 */
export function invalidateCache (pattern) {
  return (req, res, next) => {
    // Executar operação normalmente
    const originalJson = res.json.bind(res)
    res.json = function (data) {
      // Se sucesso (2xx), limpar cache do padrão
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.deletePattern(pattern)
      }
      return originalJson(data)
    }
    next()
  }
}

export default {
  cacheHeaders,
  validateETag,
  applyRouteCache,
  invalidateCache
}
