import fetch from 'node-fetch';
import { canAccessTrip, db } from '../db/database';
import { checkPermission } from './permissions';
import { createPlace } from './placeService';
import { createAssignment } from './assignmentService';
import { createItem as createPackingItem } from './packingService';
import { broadcast } from '../websocket';

const ANTHROPIC_PROXY = 'https://anthropic-proxy.walkenmultik.workers.dev/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

export const AI_SYSTEM_PROMPT = `You are a travel planning expert. Respond ONLY with valid JSON (no markdown fences, no commentary) matching this exact shape:
{
  "days": [
    {
      "day": 1,
      "title": "Day title",
      "places": [
        {
          "name": "Place name",
          "lat": 0.0,
          "lng": 0.0,
          "note": "Description and tips",
          "category": "sightseeing|food|transport|accommodation"
        }
      ],
      "estimated_cost_usd": 100
    }
  ],
  "total_budget_usd": 1000,
  "packing_suggestions": ["item1"],
  "tips": ["tip1"]
}
Use realistic coordinates when possible; if unknown, use null for lat/lng (not zero).`;

export interface AiPlace {
  name?: string;
  lat?: number | null;
  lng?: number | null;
  note?: string;
  category?: string;
}

export interface AiDay {
  day?: number;
  title?: string;
  places?: AiPlace[];
  estimated_cost_usd?: number;
}

export interface AiPlan {
  days?: AiDay[];
  total_budget_usd?: number;
  packing_suggestions?: string[];
  tips?: string[];
}

function extractJsonObject(text: string): AiPlan {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw) as AiPlan;
}

function resolveCategoryId(aiCategory: string | undefined): number | null {
  if (!aiCategory) return null;
  const key = aiCategory.toLowerCase().split('|')[0].trim();
  const rows = db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[];
  const synonyms: [string, RegExp][] = [
    ['sightseeing', /sight|view|attraction|museum|park|temple|shrine/i],
    ['food', /food|restaurant|dining|meal|café|cafe|bar/i],
    ['transport', /transport|train|bus|metro|subway|transit|airport|flight/i],
    ['accommodation', /accommodation|hotel|hostel|lodging|stay|inn/i],
  ];
  for (const [label, re] of synonyms) {
    if (key.includes(label) || re.test(key)) {
      const hit = rows.find(r => re.test(r.name) || r.name.toLowerCase().includes(label.slice(0, 4)));
      if (hit) return hit.id;
    }
  }
  const loose = rows.find(r => r.name.toLowerCase().includes(key.slice(0, Math.min(5, key.length))));
  return loose ? loose.id : null;
}

function normalizeCoords(lat: number | null | undefined, lng: number | null | undefined): { lat: number | null; lng: number | null } {
  if (lat == null || lng == null) return { lat: null, lng: null };
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { lat: null, lng: null };
  if (lat === 0 && lng === 0) return { lat: null, lng: null };
  return { lat, lng };
}

function transportModeFromCategory(cat: string | undefined): string {
  const c = (cat || '').toLowerCase();
  if (c.includes('transport')) return 'transit';
  return 'walking';
}

function ensureDayRow(tripId: string, dayNumber: number, title?: string | null): { id: number; inserted: boolean } {
  const row = db.prepare('SELECT id, title FROM days WHERE trip_id = ? AND day_number = ?').get(tripId, dayNumber) as { id: number; title: string | null } | undefined;
  if (row) {
    if (title && title.trim()) {
      db.prepare('UPDATE days SET title = ? WHERE id = ?').run(title.trim(), row.id);
    }
    return { id: row.id, inserted: false };
  }
  const r = db.prepare(
    'INSERT INTO days (trip_id, day_number, date, notes, title) VALUES (?, ?, NULL, NULL, ?)',
  ).run(tripId, dayNumber, title && title.trim() ? title.trim() : null);
  return { id: Number(r.lastInsertRowid), inserted: true };
}

export type RunAiPlanResult =
  | { ok: true; plan: AiPlan }
  | { ok: false; status: number; error: string; detail?: string };

/**
 * Runs AI trip planning and persists places (same logic as POST /api/ai/plan).
 * Caller must only invoke for a userId that is authorized for the trip (e.g. HTTP layer or Telegram link).
 */
export async function runAiPlan(opts: {
  prompt: string;
  tripId: string;
  userId: number;
  socketId?: string;
}): Promise<RunAiPlanResult> {
  const { prompt, tripId, userId, socketId } = opts;
  const p = prompt.trim();
  if (!p) return { ok: false, status: 400, error: 'prompt is required' };
  if (!tripId) return { ok: false, status: 400, error: 'tripId is required' };

  const tripAccess = canAccessTrip(tripId, userId);
  if (!tripAccess) return { ok: false, status: 404, error: 'Trip not found' };

  const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  const userRole = userRow?.role || 'user';

  const isMemberNotOwner = tripAccess.user_id !== userId;
  if (!checkPermission('place_edit', userRole, tripAccess.user_id, userId, isMemberNotOwner)) {
    return { ok: false, status: 403, error: 'No permission' };
  }
  if (!checkPermission('day_edit', userRole, tripAccess.user_id, userId, isMemberNotOwner)) {
    return { ok: false, status: 403, error: 'No permission' };
  }

  const canPack = checkPermission('packing_edit', userRole, tripAccess.user_id, userId, isMemberNotOwner);

  try {
    const resp = await fetch(ANTHROPIC_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16384,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: p }],
      }),
    });

    const rawText = await resp.text();
    if (!resp.ok) {
      return { ok: false, status: 502, error: 'AI service error', detail: rawText.slice(0, 500) };
    }

    let apiJson: { content?: { type?: string; text?: string }[] };
    try {
      apiJson = JSON.parse(rawText) as { content?: { type?: string; text?: string }[] };
    } catch {
      return { ok: false, status: 502, error: 'Invalid AI response' };
    }

    const textBlock = apiJson.content?.find(c => c.type === 'text' && c.text);
    const combined = textBlock?.text || '';
    if (!combined) return { ok: false, status: 502, error: 'Empty AI response' };

    let plan: AiPlan;
    try {
      plan = extractJsonObject(combined);
    } catch (e) {
      return { ok: false, status: 502, error: 'AI did not return valid JSON', detail: String(e) };
    }

    const planDays = Array.isArray(plan.days) ? plan.days : [];

    const run = db.transaction(() => {
      const sortedDays = [...planDays].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
      for (const d of sortedDays) {
        const dayNum = typeof d.day === 'number' && d.day > 0 ? d.day : sortedDays.indexOf(d) + 1;
        const { id: dayRowId, inserted: dayInserted } = ensureDayRow(tripId, dayNum, d.title);

        if (dayInserted) {
          const fullDay = db.prepare('SELECT * FROM days WHERE id = ?').get(dayRowId) as Record<string, unknown>;
          broadcast(tripId, 'day:created', {
            day: {
              ...fullDay,
              assignments: [],
              notes_items: [],
            },
          }, socketId);
        }

        if (typeof d.estimated_cost_usd === 'number' && !Number.isNaN(d.estimated_cost_usd)) {
          const noteLine = `Estimated daily cost (AI): USD ${d.estimated_cost_usd}`;
          const prev = db.prepare('SELECT notes FROM days WHERE id = ?').get(dayRowId) as { notes: string | null } | undefined;
          const merged = prev?.notes ? `${prev.notes}\n${noteLine}` : noteLine;
          db.prepare('UPDATE days SET notes = ? WHERE id = ?').run(merged, dayRowId);
        }

        const places = Array.isArray(d.places) ? d.places : [];
        for (const pl of places) {
          const name = typeof pl.name === 'string' ? pl.name.trim() : '';
          if (!name) continue;
          const { lat, lng } = normalizeCoords(pl.lat ?? null, pl.lng ?? null);
          const categoryId = resolveCategoryId(pl.category);
          const note = typeof pl.note === 'string' ? pl.note.trim() : '';
          const place = createPlace(tripId, {
            name,
            description: note || undefined,
            lat: lat ?? undefined,
            lng: lng ?? undefined,
            notes: note || undefined,
            category_id: categoryId ?? undefined,
            transport_mode: transportModeFromCategory(pl.category),
          });
          const placeId = place?.id;
          if (placeId != null) {
            const assignment = createAssignment(dayRowId, placeId, null);
            broadcast(tripId, 'place:created', { place }, socketId);
            broadcast(tripId, 'assignment:created', { assignment }, socketId);
          }
        }
      }

      if (canPack && Array.isArray(plan.packing_suggestions)) {
        for (const item of plan.packing_suggestions) {
          if (typeof item === 'string' && item.trim()) {
            createPackingItem(tripId, { name: item.trim(), category: 'AI' });
          }
        }
      }
    });
    run();

    return { ok: true, plan };
  } catch (err: unknown) {
    console.error('[AI plan]', err);
    return { ok: false, status: 500, error: err instanceof Error ? err.message : 'Plan failed' };
  }
}
