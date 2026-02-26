import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// POST /api/achievements/sync — achievement'larni upsert qilish
router.post('/sync', requireAuth, async (req, res) => {
  const { achievements } = req.body; // [{ id, xp_reward }]
  if (!Array.isArray(achievements) || achievements.length === 0) {
    return res.json([]);
  }

  const rows = achievements.map(a => ({
    user_id:        req.user.id,
    achievement_id: a.id,
    xp_reward:      a.xp_reward ?? 0,
  }));

  const { data, error } = await supabaseAdmin
    .from('achievements')
    .upsert(rows, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true })
    .select();

  if (error) return res.status(500).json({ error: "Achievement saqlashda xato" });
  res.json(data ?? []);
});

export default router;
