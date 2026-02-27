import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// POST /api/achievements/sync — achievement'larni upsert qilish
router.post('/sync', requireAuth, async (req, res) => {
  const { achievements } = req.body || {}; // [{ id, xp_reward }] | ['id']
  if (!Array.isArray(achievements) || achievements.length === 0) {
    return res.json([]);
  }

  const rows = [];
  const seen = new Set();

  achievements.forEach((item) => {
    let id = '';
    let xpReward = 0;

    if (typeof item === 'string') {
      id = item.trim();
    } else if (item && typeof item === 'object') {
      id = String(item.id ?? item.achievement_id ?? '').trim();
      const parsed = Number(item.xp_reward ?? item.xpBonus ?? 0);
      xpReward = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
    }

    if (!id || seen.has(id)) return;
    seen.add(id);

    rows.push({
      user_id: req.user.id,
      achievement_id: id,
      xp_reward: xpReward,
    });
  });

  if (rows.length === 0) return res.json([]);

  const { data, error } = await supabaseAdmin
    .from('achievements')
    .upsert(rows, { onConflict: 'user_id,achievement_id' })
    .select();

  if (error) return res.status(500).json({ error: "Achievement saqlashda xato" });
  res.json(data ?? []);
});

export default router;
