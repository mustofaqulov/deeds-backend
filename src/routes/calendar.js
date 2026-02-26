import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// GET /api/calendar — all completed days for the user
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('completed_days')
    .select('date, challenge_ids, total_xp')
    .eq('user_id', req.user.id)
    .order('date', { ascending: true });

  if (error) return res.status(500).json({ error: "Kalendarni yuklashda xato" });
  res.json(data ?? []);
});

// GET /api/calendar/:date — details for a specific day (YYYY-MM-DD)
router.get('/:date', requireAuth, async (req, res) => {
  const { date } = req.params;
  const userId = req.user.id;

  const [dayRes, prayerRes] = await Promise.all([
    supabaseAdmin
      .from('completed_days')
      .select('date, challenge_ids, total_xp')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
    supabaseAdmin
      .from('prayer_log')
      .select('fajr, dhuhr, asr, maghrib, isha')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
  ]);

  res.json({
    date,
    completed: dayRes.data ?? null,
    prayers: prayerRes.data ?? null,
  });
});

export default router;
