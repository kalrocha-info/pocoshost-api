/** Payload mínimo de cartão para testes (gateway mockado em mockAsaas.js). */
export function creditCardPaymentPayload(reservationId, overrides = {}) {
  return {
    reservation_id: reservationId,
    billing_type: 'CREDIT_CARD',
    card_number: '4111111111111111',
    card_holder_name: 'Teste Vitest',
    card_expiry: '12/30',
    card_cvv: '123',
    card_last4: '1111',
    billing_cpf_cnpj: '00000000000',
    billing_phone: '00000000000',
    billing_postal_code: '00000000',
    billing_address_number: '100',
    ...overrides,
  };
}

export function pixPaymentPayload(reservationId, overrides = {}) {
  return {
    reservation_id: reservationId,
    billing_type: 'PIX',
    ...overrides,
  };
}
