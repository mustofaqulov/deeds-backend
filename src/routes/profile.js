import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function parseLastTaskAt(value) {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function parseStage(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  if (parsed < 1 || parsed > 7) return undefined;
  return parsed;
}

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
  const {
    name,
    city,
    xp,
    streak,
    tasbeh,
    daily_goal,
    sound_enabled,
    onboarding_done,
    last_task_at,
    app_state,
    nafs_stage,
    nafs_assessed_at,
  } = req.body || {};

  const updates = {};

  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof city === 'string' && city.trim()) updates.city = city.trim();
  if (xp !== undefined) updates.xp = toNonNegativeInt(xp, 0);
  if (streak !== undefined) updates.streak = toNonNegativeInt(streak, 0);
  if (tasbeh !== undefined) updates.tasbeh = toNonNegativeInt(tasbeh, 0);
  if (daily_goal !== undefined) updates.daily_goal = Math.max(1, toNonNegativeInt(daily_goal, 3));

  if (sound_enabled !== undefined) updates.sound_enabled = Boolean(sound_enabled);
  if (onboarding_done !== undefined) updates.onboarding_done = Boolean(onboarding_done);

  const parsedLastTaskAt = parseLastTaskAt(last_task_at);
  if (parsedLastTaskAt !== undefined) updates.last_task_at = parsedLastTaskAt;

  if (app_state && typeof app_state === 'object' && !Array.isArray(app_state)) {
    updates.app_state = app_state;
  }

  const parsedStage = parseStage(nafs_stage);
  if (parsedStage !== undefined) updates.nafs_stage = parsedStage;

  if (nafs_assessed_at !== undefined) {
    if (nafs_assessed_at === null) {
      updates.nafs_assessed_at = null;
    } else if (typeof nafs_assessed_at === 'string') {
      const parsed = new Date(nafs_assessed_at);
      if (!Number.isNaN(parsed.getTime())) updates.nafs_assessed_at = parsed.toISOString();
    }
  }

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

// POST /api/profile/reset
router.post('/reset', requireAuth, async (req, res) => {
  const userId = req.user.id;

  await Promise.all([
    supabaseAdmin.from('active_challenges').delete().eq('user_id', userId),
    supabaseAdmin.from('completed_days').delete().eq('user_id', userId),
    supabaseAdmin.from('achievements').delete().eq('user_id', userId),
    supabaseAdmin.from('prayer_log').delete().eq('user_id', userId),
  ]);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      xp: 0,
      streak: 0,
      tasbeh: 0,
      daily_goal: 3,
      last_task_at: null,
      app_state: {},
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Reset qilishda xato' });
  res.json({ message: 'Progress 0 qilindi', profile: data });
});

// GET /api/profile/stats
router.get('/stats', requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [profileRes, achRes, daysRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('xp, streak, tasbeh, daily_goal, last_task_at, nafs_stage')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('achievements')
      .select('achievement_id, xp_reward, unlocked_at')
      .eq('user_id', userId),
    supabaseAdmin
      .from('completed_days')
      .select('date, total_xp')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30),
  ]);

  res.json({
    xp: profileRes.data?.xp ?? 0,
    streak: profileRes.data?.streak ?? 0,
    tasbeh: profileRes.data?.tasbeh ?? 0,
    daily_goal: profileRes.data?.daily_goal ?? 3,
    last_task_at: profileRes.data?.last_task_at ?? null,
    nafs_stage: profileRes.data?.nafs_stage ?? null,
    achievements: achRes.data ?? [],
    recent_days: daysRes.data ?? [],
  });
});

export default router;
