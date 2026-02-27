import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeChallengeIds(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )];
}

function normalizeDateKey(value) {
  const date = String(value || '').trim();
  return DATE_KEY_RE.test(date) ? date : null;
}

function normalizeXp(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizeStreak(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.round(parsed));
}

function toIsoFromDateKey(dateKey) {
  return `${dateKey}T00:00:00.000Z`;
}

function normalizeDayRows(daysInput) {
  if (!daysInput) return [];

  if (Array.isArray(daysInput)) {
    return daysInput
      .map((item) => ({
        date: normalizeDateKey(item?.date),
        challenge_ids: normalizeChallengeIds(item?.challenge_ids),
        total_xp: normalizeXp(item?.total_xp ?? item?.xp ?? 0, 0),
      }))
      .filter((item) => item.date);
  }

  if (typeof daysInput === 'object') {
    return Object.entries(daysInput)
      .map(([date, challengeIds]) => ({
        date: normalizeDateKey(date),
        challenge_ids: normalizeChallengeIds(challengeIds),
        total_xp: 0,
      }))
      .filter((item) => item.date);
  }

  return [];
}

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

// POST /api/challenges
router.post('/', requireAuth, async (req, res) => {
  const {
    title,
    category = 'ibadah',
    base_xp = 20,
    icon = '✨',
    frontend_id,
  } = req.body;

  const safeTitle = String(title || '').trim();
  if (!safeTitle) return res.status(400).json({ error: 'title majburiy' });

  const safeFrontendId = typeof frontend_id === 'string' && frontend_id.trim()
    ? frontend_id.trim()
    : null;

  const payload = {
    user_id: req.user.id,
    title: safeTitle,
    category: String(category || 'ibadah'),
    base_xp: normalizeXp(base_xp, 20),
    icon: String(icon || '✨'),
    frontend_id: safeFrontendId,
  };

  if (safeFrontendId) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('active_challenges')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('frontend_id', safeFrontendId)
      .maybeSingle();

    if (existingError) return res.status(500).json({ error: "Challenge tekshirishda xato" });

    if (existing) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('active_challenges')
        .update({
          title: payload.title,
          category: payload.category,
          base_xp: payload.base_xp,
          icon: payload.icon,
        })
        .eq('id', existing.id)
        .eq('user_id', req.user.id)
        .select()
        .single();

      if (updateError) return res.status(500).json({ error: 'Challenge yangilashda xato' });
      return res.status(200).json(updated);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('active_challenges')
    .insert(payload)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Challenge yaratishda xato' });
  res.status(201).json(data);
});

// DELETE /api/challenges/fid/:frontend_id
router.delete('/fid/:frontend_id', requireAuth, async (req, res) => {
  const frontendId = String(req.params.frontend_id || '').trim();
  if (!frontendId) return res.status(400).json({ error: 'frontend_id majburiy' });

  const { error } = await supabaseAdmin
    .from('active_challenges')
    .delete()
    .eq('frontend_id', frontendId)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: "Challengeni o'chirishda xato" });
  res.json({ message: "O'chirildi" });
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

// POST /api/challenges/complete
router.post('/complete', requireAuth, async (req, res) => {
  const date = normalizeDateKey(req.body?.date);
  const challengeIds = normalizeChallengeIds(req.body?.challenge_ids);
  const totalXp = normalizeXp(req.body?.total_xp, null);
  const streak = normalizeStreak(req.body?.streak);

  if (!date || totalXp === null) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) va total_xp majburiy' });
  }

  const userId = req.user.id;
  const dayPayload = {
    user_id: userId,
    date,
    challenge_ids: challengeIds,
    total_xp: totalXp,
  };

  const { data: dayData, error: dayError } = await supabaseAdmin
    .from('completed_days')
    .upsert(dayPayload, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (dayError) return res.status(500).json({ error: 'Kunni saqlashda xato' });

  const profileUpdates = { xp: totalXp };
  if (typeof streak === 'number') profileUpdates.streak = streak;
  if (challengeIds.length > 0) profileUpdates.last_task_at = toIsoFromDateKey(date);

  const { data: updatedProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .update(profileUpdates)
    .eq('id', userId)
    .select()
    .single();

  if (profileError) return res.status(500).json({ error: 'Profilni yangilashda xato' });

  res.json({ day: dayData, profile: updatedProfile });
});

// POST /api/challenges/sync
router.post('/sync', requireAuth, async (req, res) => {
  const dayRows = normalizeDayRows(req.body?.days);
  const xp = normalizeXp(req.body?.xp, undefined);
  const streak = normalizeStreak(req.body?.streak);

  if (dayRows.length === 0 && xp === undefined && streak === undefined) {
    return res.status(400).json({ error: "Sync uchun days yoki profile maydoni kerak" });
  }

  const userId = req.user.id;

  if (dayRows.length > 0) {
    const rows = dayRows.map((item) => ({
      user_id: userId,
      date: item.date,
      challenge_ids: item.challenge_ids,
      total_xp: normalizeXp(item.total_xp, 0),
    }));

    const { error: upsertError } = await supabaseAdmin
      .from('completed_days')
      .upsert(rows, { onConflict: 'user_id,date' });

    if (upsertError) return res.status(500).json({ error: 'Kunlik ma\'lumotlarni sync qilishda xato' });
  }

  let profile = null;
  if (xp !== undefined || streak !== undefined) {
    const profileUpdates = {};
    if (xp !== undefined) profileUpdates.xp = xp;
    if (streak !== undefined) profileUpdates.streak = streak;

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdates)
      .eq('id', userId)
      .select()
      .single();

    if (profileError) return res.status(500).json({ error: 'Profil syncda xato' });
    profile = profileData;
  }

  res.json({
    synced_days: dayRows.length,
    profile,
  });
});

// POST /api/challenges/undo
router.post('/undo', requireAuth, async (req, res) => {
  const date = normalizeDateKey(req.body?.date);
  const xpAfterUndo = normalizeXp(req.body?.xp_after_undo, null);
  const streak = normalizeStreak(req.body?.streak);

  if (!date || xpAfterUndo === null) {
    return res.status(400).json({ error: 'date va xp_after_undo majburiy' });
  }

  const userId = req.user.id;

  const { error: deleteError } = await supabaseAdmin
    .from('completed_days')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);

  if (deleteError) return res.status(500).json({ error: "Kunni o'chirishda xato" });

  const profileUpdates = { xp: xpAfterUndo };
  if (streak !== undefined) profileUpdates.streak = streak;

  const { data: updatedProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .update(profileUpdates)
    .eq('id', userId)
    .select()
    .single();

  if (profileError) return res.status(500).json({ error: 'Profilni yangilashda xato' });

  res.json({ profile: updatedProfile });
});

export default router;
