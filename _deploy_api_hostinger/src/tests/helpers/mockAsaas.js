import { vi } from 'vitest';

/** Mock do gateway Asaas — testes não devem chamar a API externa. */
export function mapAsaasStatusMock(status) {
  const normalized = String(status).toUpperCase();
  if (['CONFIRMED', 'RECEIVED'].includes(normalized)) return 'paid';
  if (['PENDING', 'IN_ANALYSIS', 'DRAFT'].includes(normalized)) return 'pending';
  if (['CANCELLED', 'REFUNDED', 'OVERDUE', 'FAILED'].includes(normalized)) return 'refunded';
  return 'pending';
}

vi.mock('../../services/asaasService.js', () => ({
  findOrCreateCustomer: vi.fn(async (user) => ({
    id: 'cus_test_mock_001',
    name: user?.name ?? 'Teste Vitest',
    email: user?.email ?? 'test@vitest.local',
    cpfCnpj: user?.cpf ?? '00000000000',
    phone: user?.phone ?? '00000000000',
  })),
  createCreditCardPayment: vi.fn(async () => ({
    id: 'pay_cc_test_mock',
    status: 'CONFIRMED',
  })),
  createPixPayment: vi.fn(async () => ({
    id: 'pay_pix_test_mock',
    status: 'PENDING',
    pix: {
      encodedImage: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      payload: '00020126580014BR.GOV.BCB.PIX0136mock-pix-pocoshost-test',
    },
  })),
  mapAsaasStatus: mapAsaasStatusMock,
}));
