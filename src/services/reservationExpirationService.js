import { pool } from '../db/pool.js';

const parsedHoldMinutes = Number(process.env.RESERVATION_HOLD_MINUTES ?? 30);
const parsedRequestHoldDays = Number(process.env.RESERVATION_REQUEST_HOLD_DAYS ?? 7);

export const RESERVATION_HOLD_MINUTES =
  Number.isFinite(parsedHoldMinutes) && parsedHoldMinutes > 0 ? parsedHoldMinutes : 30;

export const RESERVATION_REQUEST_HOLD_DAYS =
  Number.isFinite(parsedRequestHoldDays) && parsedRequestHoldDays > 0 ? parsedRequestHoldDays : 7;

export function activeReservationStatusSql(alias = 'r') {
  return `(${alias}.status = 'confirmed' OR (${alias}.status IN ('pending', 'approved') AND ${alias}.expires_at > NOW()))`;
}

export async function expirePendingReservations(db = pool) {
  const result = await db.query(
    `UPDATE reservations
        SET status = 'cancelled',
            expired_at = COALESCE(expired_at, NOW()),
            updated_date = NOW()
      WHERE status IN ('pending', 'approved')
        AND expires_at <= NOW()
      RETURNING id`
  );

  return result.rows;
}

export function startReservationExpirationWorker({ intervalMs = 60_000, onError } = {}) {
  const run = () => {
    expirePendingReservations().catch((err) => onError?.(err));
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
