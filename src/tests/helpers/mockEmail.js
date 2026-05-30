import { vi } from 'vitest';

/**
 * Mock do emailService — impede chamadas reais ao SMTP em testes.
 * Expõe spies para verificar se os e-mails foram disparados.
 */
export const sendReservationConfirmationToGuestSpy = vi.fn().mockResolvedValue({ messageId: 'mock-guest-001' });
export const sendReservationConfirmationToHostSpy = vi.fn().mockResolvedValue({ messageId: 'mock-host-001' });

vi.mock('../../services/emailService.js', () => ({
  sendReservationConfirmationToGuest: sendReservationConfirmationToGuestSpy,
  sendReservationConfirmationToHost: sendReservationConfirmationToHostSpy,
}));
