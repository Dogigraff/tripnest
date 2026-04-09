import type { Express } from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { listTrips } from '../services/tripService';
import { runAiPlan } from '../services/aiPlanService';
import type { AiPlan } from '../services/aiPlanService';
import {
  getTelegramLink,
  linkTelegramAccount,
  pickTripIdForAi,
  setLastTripId,
} from '../services/telegramLinkService';
import { setTelegramBotInstance } from './notifications';

let activeBot: TelegramBot | null = null;
let pollingStarted = false;

function publicBaseUrl(): string {
  const u = process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || '';
  return u.replace(/\/$/, '') || 'http://localhost:3000';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatPlanSummary(plan: AiPlan): string {
  const days = Array.isArray(plan.days) ? plan.days : [];
  const lines = days.map((d, i) => {
    const n = typeof d.day === 'number' ? d.day : i + 1;
    const title = typeof d.title === 'string' && d.title ? d.title : `Day ${n}`;
    const count = Array.isArray(d.places) ? d.places.length : 0;
    return `• ${title}: ${count} places`;
  });
  const budget = typeof plan.total_budget_usd === 'number' ? `\nBudget (est.): $${plan.total_budget_usd}` : '';
  const tips =
    Array.isArray(plan.tips) && plan.tips.length
      ? `\nTips:\n${plan.tips.slice(0, 5).map(t => `• ${t}`).join('\n')}`
      : '';
  return (lines.join('\n') + budget + tips).trim() || 'Plan generated.';
}

/**
 * Starts Telegram bot if TELEGRAM_BOT_TOKEN is set.
 * - Polling by default, or webhook if TELEGRAM_WEBHOOK_URL is set (full URL to POST /api/bot/webhook).
 * - Registers POST /api/bot/webhook on the Express app for webhook mode (and for Telegram to POST updates).
 */
export function initTelegramBot(app: Express): void {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  const useWebhook = !!webhookUrl;

  const bot = new TelegramBot(token, { polling: false });
  activeBot = bot;
  setTelegramBotInstance(bot);

  const sendTripsList = async (chatId: number, telegramUserId: number) => {
    const link = getTelegramLink(telegramUserId);
    if (!link) {
      await bot.sendMessage(
        chatId,
        'Account not linked. Use:\n/link your@email.com your_password',
      );
      return;
    }
    const trips = listTrips(link.user_id, 0) as { id: number; title: string }[];
    if (!trips.length) {
      await bot.sendMessage(chatId, 'You have no trips yet. Create one in the web app (Create Trip button).');
      return;
    }
    const base = publicBaseUrl();
    const text = trips
      .map(t => `• <a href="${base}/trips/${t.id}">${escapeHtml(t.title)}</a>`)
      .join('\n');
    await bot.sendMessage(chatId, `Your trips:\n${text}`, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  };

  bot.onText(/\/start/, async msg => {
    const chatId = msg.chat.id;
    const base = publicBaseUrl();
    await bot.sendMessage(
      chatId,
      'Welcome to TripNest! Link your account once, then list trips or send a message for AI planning.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'My Trips', callback_data: 'tg_my_trips' }],
            [{ text: 'Create Trip', url: `${base}/dashboard` }],
          ],
        },
      },
    );
  });

  bot.onText(/\/help/, async msg => {
    await bot.sendMessage(
      msg.chat.id,
      [
        '/start — welcome & keyboard',
        '/trips — your trips with links',
        '/link email@example.com password — link TripNest account',
        '/help — commands',
        '',
        'Any other text: AI plan for your default trip (uses last trip after planning).',
      ].join('\n'),
    );
  });

  bot.onText(/\/trips/, async msg => {
    if (!msg.from) return;
    await sendTripsList(msg.chat.id, msg.from.id);
  });

  bot.onText(/^\/link\s+(\S+)\s+(.+)$/s, async (msg, match) => {
    if (!match || !msg.from) return;
    const email = match[1];
    const password = match[2].trim();
    const r = linkTelegramAccount(msg.from.id, email, password);
    if (!r.ok) {
      await bot.sendMessage(msg.chat.id, `Link failed: ${r.error}`);
      return;
    }
    await bot.sendMessage(msg.chat.id, 'Account linked. Try /trips or send a planning message.');
  });

  bot.on('callback_query', async query => {
    if (query.data !== 'tg_my_trips' || !query.from) return;
    await bot.answerCallbackQuery(query.id);
    const chatId = query.message?.chat.id;
    if (chatId == null) return;
    await sendTripsList(chatId, query.from.id);
  });

  bot.on('message', async msg => {
    const text = msg.text?.trim();
    if (!text || !msg.from) return;
    if (text.startsWith('/')) return;

    const link = getTelegramLink(msg.from.id);
    if (!link) {
      await bot.sendMessage(
        msg.chat.id,
        'Link your account: /link your@email.com your_password',
      );
      return;
    }

    const tripId = pickTripIdForAi(msg.from.id, link.user_id);
    if (tripId == null) {
      await bot.sendMessage(msg.chat.id, 'No trip found. Create a trip in the web app first.');
      return;
    }

    await bot.sendMessage(msg.chat.id, 'Planning…');
    const result = await runAiPlan({
      prompt: text,
      tripId: String(tripId),
      userId: link.user_id,
    });

    if (!result.ok) {
      const errText = `Error: ${result.error}${result.detail ? `\n${result.detail}` : ''}`.slice(0, 3900);
      await bot.sendMessage(msg.chat.id, errText);
      return;
    }
    setLastTripId(msg.from.id, tripId);
    await bot.sendMessage(msg.chat.id, formatPlanSummary(result.plan));
  });

  app.post('/api/bot/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  if (useWebhook && webhookUrl) {
    bot.setWebHook(webhookUrl).catch((err: unknown) => console.error('[Telegram] setWebHook failed:', err));
  } else {
    bot.startPolling();
    pollingStarted = true;
  }

  console.log(`[Telegram] bot ready (${useWebhook ? 'webhook' : 'polling'})`);
}

export { sendTripReminder, sendPlaceAdded, getTelegramBotInstance } from './notifications';

export function stopTelegramBot(): void {
  if (!activeBot) return;
  try {
    if (pollingStarted) activeBot.stopPolling({ cancel: true });
    void activeBot.deleteWebHook();
  } catch {
    /* ignore */
  }
  setTelegramBotInstance(null);
  activeBot = null;
  pollingStarted = false;
}
