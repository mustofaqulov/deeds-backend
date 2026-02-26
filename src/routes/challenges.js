import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// GET /api/challenges
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('active_challenges')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: "Challengelarni yuklashda xato" });
  res.json(data ?? []);
});

// POST /api/challenges — frontend_id ni ham qabul qiladi
router.post('/', requireAuth, async (req, res) => {
  const { title, category = 'ibadah', base_xp = 20, icon = '✨', frontend_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title majburiy' });

  // Agar frontend_id bilan challenge allaqachon mavjud bo'lsa — mavjudini qaytarish
  if (frontend_id) {
    const { data: existing } = await supabaseAdmin
      .from('active_challenges')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('frontend_id', frontend_id)
      .maybeSingle();

    if (existing) return res.status(200).json(existing);
  }

  const { data, error } = await supabaseAdmin
    .from('active_challenges')
    .insert({ user_id: req.user.id, title, category, base_xp, icon, frontend_id: frontend_id || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Challenge yaratishda xato" });
  res.status(201).json(data);
});

// DELETE /api/challenges/:id — UUID bilan o'chirish
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('active_challenges')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: "Challengeni o'chirishda xato" });
  res.json({ message: "O'chirildi" });
});

// DELETE /api/challenges/fid/:frontend_id — frontend_id bilan o'chirish
router.delete('/fid/:frontend_id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('active_challenges')
    .delete()
    .eq('frontend_id', req.params.frontend_id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: "Challengeni o'chirishda xato" });
  res.json({ message: "O'chirildi" });
});

// POST /api/challenges/complete
router.post('/complete', requireAuth, async (req, res) => {
  const { date, challenge_ids, total_xp } = req.body;
  if (!date || !Array.isArray(challenge_ids) || typeof total_xp !== 'number') {
    return res.status(400).json({ error: 'date, challenge_ids[], total_xp majburiy' });
  }

  const userId = req.user.id;

  const { data: dayData, error: dayError } = await supabaseAdmin
    .from('completed_days')
    .upsert({ user_id: userId, date, challenge_ids, total_xp }, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (dayError) return res.status(500).json({ error: "Kunni saqlashda xato" });

  // XP ni to'liq yangilash (client hisoblagan qiymat)
  const { data: updatedProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ xp: total_xp, streak: req.body.streak ?? undefined, last_task_at: new Date(date).toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (profileError) return res.status(500).json({ error: "XP yangilashda xato" });

  res.json({ day: dayData, profile: updatedProfile });
});

// POST /api/challenges/undo
router.post('/undo', requireAuth, async (req, res) => {
  const { date, xp_after_undo } = req.body;
  if (!date || typeof xp_after_undo !== 'number') {
    return res.status(400).json({ error: 'date, xp_after_undo majburiy' });
  }

  const userId = req.user.id;

  await supabaseAdmin.from('completed_days').delete().eq('user_id', userId).eq('date', date);

  const { data: updatedProfile } = await supabaseAdmin
    .from('profiles')
    .update({ xp: xp_after_undo })
    .eq('id', userId)
    .select()
    .single();

  res.json({ profile: updatedProfile });
});

export default router;
