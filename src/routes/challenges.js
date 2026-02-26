import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// GET /api/challenges — list user's active challenges
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('active_challenges')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: "Challengelarni yuklashda xato" });
  res.json(data ?? []);
});

// POST /api/challenges — create a new challenge
router.post('/', requireAuth, async (req, res) => {
  const { title, category = 'ibadah', base_xp = 20, icon = '✨' } = req.body;
  if (!title) return res.status(400).json({ error: 'title majburiy' });

  const { data, error } = await supabaseAdmin
    .from('active_challenges')
    .insert({ user_id: req.user.id, title, category, base_xp, icon })
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Challenge yaratishda xato" });
  res.status(201).json(data);
});

// DELETE /api/challenges/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('active_challenges')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: "Challengeni o'chirishda xato" });
  res.json({ message: "O'chirildi" });
});

// POST /api/challenges/complete — mark challenges done for today, earn XP
router.post('/complete', requireAuth, async (req, res) => {
  const { date, challenge_ids, total_xp } = req.body;
  if (!date || !Array.isArray(challenge_ids) || typeof total_xp !== 'number') {
    return res.status(400).json({ error: 'date, challenge_ids[], total_xp majburiy' });
  }

  const userId = req.user.id;

  // Upsert completed_day record
  const { data: dayData, error: dayError } = await supabaseAdmin
    .from('completed_days')
    .upsert({ user_id: userId, date, challenge_ids, total_xp }, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (dayError) return res.status(500).json({ error: "Kunni saqlashda xato" });

  // Update profile XP and streak
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('xp, streak, last_task_at')
    .eq('id', userId)
    .single();

  const newXP = (profile?.xp ?? 0) + total_xp;
  const newStreak = computeNewStreak(profile?.streak ?? 0, profile?.last_task_at, date);

  const { data: updatedProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ xp: newXP, streak: newStreak, last_task_at: new Date(date).toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (profileError) return res.status(500).json({ error: "XP yangilashda xato" });

  res.json({ day: dayData, profile: updatedProfile });
});

// POST /api/challenges/undo — undo today's completion
router.post('/undo', requireAuth, async (req, res) => {
  const { date, xp_to_remove } = req.body;
  if (!date || typeof xp_to_remove !== 'number') {
    return res.status(400).json({ error: 'date, xp_to_remove majburiy' });
  }

  const userId = req.user.id;

  // Delete the day record
  await supabaseAdmin
    .from('completed_days')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);

  // Subtract XP from profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('xp')
    .eq('id', userId)
    .single();

  const newXP = Math.max(0, (profile?.xp ?? 0) - xp_to_remove);

  const { data: updatedProfile } = await supabaseAdmin
    .from('profiles')
    .update({ xp: newXP })
    .eq('id', userId)
    .select()
    .single();

  res.json({ profile: updatedProfile });
});

// --- Helper ---
function computeNewStreak(currentStreak, lastTaskAt, todayDate) {
  if (!lastTaskAt) return 1;
  const last = new Date(lastTaskAt);
  const today = new Date(todayDate);
  const diffDays = Math.round((today - last) / 86400000);
  if (diffDays === 1) return currentStreak + 1;  // consecutive
  if (diffDays === 0) return currentStreak;       // same day
  return 1;                                       // streak broken
}

export default router;
