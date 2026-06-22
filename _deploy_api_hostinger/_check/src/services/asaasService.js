import { createHash } from 'crypto';

function cleanEnvValue(value) {
  if (!value) return value;
  const trimmed = value.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

function normalizeAsaasApiKey(value) {
  const cleaned = cleanEnvValue(value);
  if (!cleaned) return cleaned;
  if (cleaned.startsWith('$')) return cleaned;
  if (cleaned.startsWith('aact_')) {
    return `$${cleaned}`;
  }
  return cleaned;
}

const ASAAS_API_URL = cleanEnvValue(process.env.ASAAS_API_URL);
const ASAAS_API_KEY = normalizeAsaasApiKey(process.env.ASAAS_API_KEY);
const ASAAS_PLATFORM_FEE_PERCENT = Number(process.env.ASAAS_PLATFORM_FEE_PERCENT ?? 15.5);

function detectAsaasKeyEnvironment(key) {
  if (!key) return 'missing';
  if (key.startsWith('$aact_hmlg_')) return 'sandbox';
  if (key.startsWith('$aact_prod_')) return 'production';
  return 'unknown';
}

function detectAsaasUrlEnvironment(url) {
  if (!url) return 'missing';
  if (url.includes('api-sandbox.asaas.com')) return 'sandbox';
  if (url.includes('api.asaas.com')) return 'production';
  return 'unknown';
}

export function getAsaasConfigSummary() {
  const rawKey = process.env.ASAAS_API_KEY;
  const cleanedRawKey = cleanEnvValue(rawKey);
  return {
    api_url: ASAAS_API_URL || null,
    api_url_environment: detectAsaasUrlEnvironment(ASAAS_API_URL),
    api_key_present: Boolean(ASAAS_API_KEY),
    api_key_environment: detectAsaasKeyEnvironment(ASAAS_API_KEY),
    api_key_length: ASAAS_API_KEY?.length ?? 0,
    api_key_starts_with_dollar: ASAAS_API_KEY?.startsWith('$') ?? false,
    api_key_raw_starts_with_dollar: cleanedRawKey?.startsWith('$') ?? false,
    api_key_prefix_hint: ASAAS_API_KEY ? ASAAS_API_KEY.slice(0, 11) : null,
    api_key_raw_prefix_hint: cleanedRawKey ? cleanedRawKey.slice(0, 10) : null,
    api_key_dollar_was_normalized: Boolean(
      cleanedRawKey &&
      !cleanedRawKey.startsWith('$') &&
      ASAAS_API_KEY?.startsWith('$')
    ),
    api_key_had_outer_whitespace: Boolean(rawKey && rawKey !== rawKey.trim()),
    api_key_had_outer_quotes: Boolean(
      rawKey &&
      ((rawKey.trim().startsWith('"') && rawKey.trim().endsWith('"')) ||
        (rawKey.trim().startsWith("'") && rawKey.trim().endsWith("'")))
    ),
    api_key_hash_prefix: ASAAS_API_KEY
      ? createHash('sha256').update(ASAAS_API_KEY).digest('hex').slice(0, 12)
      : null,
  };
}

function operationalError(message, { status = 422, code = 'ASAAS_REQUEST_REJECTED', response } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.publicMessage = message;
  error.response = response;
  return error;
}

function ensureAsaasConfig() {
  if (!ASAAS_API_URL || !ASAAS_API_KEY) {
    throw operationalError(
      'Pagamento indisponível: configuração do Asaas incompleta no servidor.',
      { status: 503, code: 'ASAAS_CONFIG_INCOMPLETE' }
    );
  }
}

async function asaasFetch(path, options = {}) {
  ensureAsaasConfig();

  const url = `${ASAAS_API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'PocosHost/1.0.0',
    access_token: ASAAS_API_KEY,
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    throw operationalError(
      'Não foi possível conectar ao Asaas. Tente novamente em alguns instantes.',
      { status: 502, code: 'ASAAS_UNAVAILABLE' }
    );
  }

  const body = await response.text();
  let data = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = data?.errors?.[0]?.description || data?.message || response.statusText;
    throw operationalError(`Pagamento recusado pelo Asaas: ${message}`, {
      status: response.status >= 500 ? 502 : 422,
      code: 'ASAAS_REQUEST_REJECTED',
      response: data,
      configSummary: getAsaasConfigSummary(),
    });
  }

  return data;
}

export async function findOrCreateCustomer(user) {
  const searchParams = new URLSearchParams();
  if (user.cpf) {
    searchParams.append('cpfCnpj', user.cpf);
  } else if (user.email) {
    searchParams.append('email', user.email);
  }

  if (searchParams.toString()) {
    try {
      const existing = await asaasFetch(`/customers?${searchParams.toString()}`, { method: 'GET' });
      if (Array.isArray(existing.data) && existing.data.length > 0) {
        return existing.data[0];
      }
    } catch (err) {
      // Se a busca falhar, continuamos para tentar criar o cliente
      console.warn('ASAAS customer search failed:', err.message);
    }
  }

  const body = {
    name: user.name,
    email: user.email,
    cpfCnpj: user.cpf || undefined,
    phone: user.phone || undefined,
    mobilePhone: user.phone || undefined,
    notificationDisabled: false,
  };

  const customer = await asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return customer;
}

function parseExpiry(expiry) {
  const cleaned = expiry.trim();
  const match = cleaned.match(/^(\d{2})\/(\d{2,4})$/);
  if (!match) {
    throw new Error('Validade do cartão inválida. Use MM/AA.');
  }

  const [, month, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return { expiryMonth: month, expiryYear: year };
}

export async function createCreditCardPayment({ customer, reservation, cardData, holderInfo, remoteIp, hostWalletId }) {
  const { expiryMonth, expiryYear } = parseExpiry(cardData.expiry);
  const platformFee = Number(ASAAS_PLATFORM_FEE_PERCENT);
  const paymentBody = {
    customer: customer.id,
    billingType: 'CREDIT_CARD',
    value: reservation.totalPrice,
    dueDate: new Date().toISOString().split('T')[0],
    description: reservation.description || `Reserva #${reservation.id} - ${reservation.propertyName}`,
    externalReference: `reservation_${reservation.id}`,
    creditCard: {
      holderName: cardData.holderName,
      number: cardData.number,
      expiryMonth,
      expiryYear,
      ccv: cardData.cvv,
    },
    creditCardHolderInfo: {
      name: holderInfo.name,
      email: holderInfo.email,
      cpfCnpj: holderInfo.cpfCnpj,
      postalCode: holderInfo.postalCode,
      addressNumber: holderInfo.addressNumber,
      phone: holderInfo.phone,
    },
    remoteIp,
  };

  if (hostWalletId) {
    const hostShare = Math.max(0, 100 - platformFee);
    paymentBody.split = [{ walletId: hostWalletId, percentualValue: hostShare }];
  }

  return asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify(paymentBody),
  });
}

export async function createPixPayment({ customer, reservation, hostWalletId }) {
  const platformFee = Number(ASAAS_PLATFORM_FEE_PERCENT);
  const paymentBody = {
    customer: customer.id,
    billingType: 'PIX',
    value: reservation.totalPrice,
    dueDate: new Date().toISOString().split('T')[0],
    description: reservation.description || `Reserva #${reservation.id} - ${reservation.propertyName}`,
    externalReference: `reservation_${reservation.id}`,
  };

  if (hostWalletId) {
    const hostShare = Math.max(0, 100 - platformFee);
    paymentBody.split = [{ walletId: hostWalletId, percentualValue: hostShare }];
  }

  const payment = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify(paymentBody),
  });

  const pixData = await asaasFetch(`/payments/${payment.id}/pixQrCode`, {
    method: 'GET',
  });

  return {
    ...payment,
    pix: pixData,
  };
}

export function mapAsaasStatus(status) {
  const normalized = String(status).toUpperCase();
  if (['CONFIRMED', 'RECEIVED'].includes(normalized)) return 'paid';
  if (['PENDING', 'IN_ANALYSIS', 'DRAFT'].includes(normalized)) return 'pending';
  if (['CANCELLED', 'REFUNDED', 'OVERDUE', 'FAILED'].includes(normalized)) return 'refunded';
  return 'pending';
}
