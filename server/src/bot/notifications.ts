import type TelegramBot from 'node-telegram-bot-api';

let botRef: TelegramBot | null = null;

export function setTelegramBotInstance(bot: TelegramBot | null): void {
  botRef = bot;
}

export function getTelegramBotInstance(): TelegramBot | null {
  return botRef;
}

export function sendTripReminder(
  chatId: number,
  trip: { title?: string | null; name?: string | null },
  daysUntil: number,
): void {
  if (!botRef) return;
  const name = trip.title || trip.name || 'Trip';
  void botRef.sendMessage(chatId, `Your trip ${name} starts in ${daysUntil} days!`).catch(() => {});
}

export function sendPlaceAdded(chatId: number, placeName: string, tripName: string): void {
  if (!botRef) return;
  void botRef.sendMessage(chatId, `New place added: ${placeName} in ${tripName}`).catch(() => {});
}
