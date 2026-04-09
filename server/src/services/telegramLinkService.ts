import bcrypt from 'bcryptjs';
import { db, canAccessTrip } from '../db/database';
import { listTrips } from './tripService';

export interface TelegramLinkRow {
  telegram_user_id: number;
  user_id: number;
  last_trip_id: number | null;
}

export function getTelegramLink(telegramUserId: number): TelegramLinkRow | null {
  return db.prepare(
    'SELECT telegram_user_id, user_id, last_trip_id FROM telegram_users WHERE telegram_user_id = ?',
  ).get(telegramUserId) as TelegramLinkRow | null;
}

export function linkTelegramAccount(telegramUserId: number, email: string, password: string): { ok: true; userId: number } | { ok: false; error: string } {
  const user = db.prepare('SELECT id, password_hash FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim()) as { id: number; password_hash: string } | undefined;
  if (!user?.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    return { ok: false, error: 'Invalid email or password' };
  }
  db.prepare(
    `INSERT INTO telegram_users (telegram_user_id, user_id, last_trip_id) VALUES (?, ?, NULL)
     ON CONFLICT(telegram_user_id) DO UPDATE SET user_id = excluded.user_id, last_trip_id = NULL`,
  ).run(telegramUserId, user.id);
  return { ok: true, userId: user.id };
}

export function setLastTripId(telegramUserId: number, tripId: number): void {
  db.prepare('UPDATE telegram_users SET last_trip_id = ? WHERE telegram_user_id = ?').run(tripId, telegramUserId);
}

/**
 * Picks a trip for AI: last linked trip if still accessible, else most recently created trip.
 */
export function pickTripIdForAi(telegramUserId: number, userId: number): number | null {
  const link = getTelegramLink(telegramUserId);
  if (!link || link.user_id !== userId) return null;

  if (link.last_trip_id != null && canAccessTrip(link.last_trip_id, userId)) {
    return link.last_trip_id;
  }

  const trips = listTrips(userId, 0) as { id: number }[];
  if (!trips.length) return null;
  return trips[0].id;
}
