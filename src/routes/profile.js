import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// GET /api/profile
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(404).json({ error: 'Profil topilmadi' });
  res.json(data);
});

// PUT /api/profile
router.put('/', requireAuth, async (req, res) => {
  const { name, city } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (city) updates.city = city;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "O'zgartiriladigan maydon yo'q" });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Profilni yangilashda xato" });
  res.json(data);
});

// GET /api/profile/stats — XP, achievements, streak
router.get('/stats', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [profileRes, achRes, daysRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('xp, streak, last_task_at').eq('id', userId).single(),
    supabaseAdmin.from('achievements').select('achievement_id, xp_reward, unlocked_at').eq('user_id', userId),
    supabaseAdmin.from('completed_days').select('date, total_xp').eq('user_id', userId).order('date', { ascending: false }).limit(30),
  ]);

  res.json({
    xp: profileRes.data?.xp ?? 0,
    streak: profileRes.data?.streak ?? 0,
    last_task_at: profileRes.data?.last_task_at ?? null,
    achievements: achRes.data ?? [],
    recent_days: daysRes.data ?? [],
  });
});

export default router;
