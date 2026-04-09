import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { runAiPlan } from '../services/aiPlanService';
import { AuthRequest } from '../types';

const router = express.Router();

router.post('/plan', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const body = req.body as { prompt?: string; tripId?: string | number; userId?: number };

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const tripId = body.tripId != null ? String(body.tripId) : '';
  const clientUserId = body.userId != null ? Number(body.userId) : NaN;

  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (!tripId) return res.status(400).json({ error: 'tripId is required' });
  if (!Number.isFinite(clientUserId) || clientUserId !== authReq.user.id) {
    return res.status(400).json({ error: 'userId must match the authenticated user' });
  }

  const socketId = req.headers['x-socket-id'] as string | undefined;
  const result = await runAiPlan({
    prompt,
    tripId,
    userId: authReq.user.id,
    socketId,
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, detail: result.detail });
  }
  return res.json(result.plan);
});

export default router;
