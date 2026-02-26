import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// GET /api/data/full — barcha ma'lumotlarni bir requestda yuklash
router.get('/full', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [profileRes, challengesRes, daysRes, achRes, prayerRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
    supabaseAdmin.from('active_challenges').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabaseAdmin.from('completed_days').select('date, challenge_ids, total_xp').eq('user_id', userId).order('date', { ascending: true }),
    supabaseAdmin.from('achievements').select('achievement_id, xp_reward, unlocked_at').eq('user_id', userId),
    supabaseAdmin.from('prayer_log').select('date, fajr, dhuhr, asr, maghrib, isha').eq('user_id', userId).order('date', { ascending: true }),
  ]);

  res.json({
    profile:        profileRes.data    ?? null,
    challenges:     challengesRes.data ?? [],
    completed_days: daysRes.data       ?? [],
    achievements:   achRes.data        ?? [],
    prayer_log:     prayerRes.data     ?? [],
  });
});

export default router;
