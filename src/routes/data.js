import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_PRAYER_STATUSES = ['pending', 'on_time', 'jamaat', 'qaza', 'missed'];
const LEGACY_PRAYER_STATUS = {
  late: 'on_time',
  skipped: 'missed',
};

function normalizeDateKey(value) {
  const date = String(value || '').trim();
  return DATE_KEY_RE.test(date) ? date : null;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizePrayerStatus(value) {
  if (value === null || value === undefined || value === '') return 'pending';
  const raw = String(value).trim().toLowerCase();
  const mapped = LEGACY_PRAYER_STATUS[raw] || raw;
  return VALID_PRAYER_STATUSES.includes(mapped) ? mapped : 'pending';
}

function normalizeProfileUpdates(input = {}) {
  const updates = {};

  if (typeof input.name === 'string' && input.name.trim()) updates.name = input.name.trim();
  if (typeof input.city === 'string' && input.city.trim()) updates.city = input.city.trim();

  if (input.xp !== undefined) updates.xp = normalizeNumber(input.xp, 0);
  if (input.streak !== undefined) updates.streak = normalizeNumber(input.streak, 0);
  if (input.tasbeh !== undefined) updates.tasbeh = normalizeNumber(input.tasbeh, 0);
  if (input.daily_goal !== undefined) updates.daily_goal = Math.max(1, normalizeNumber(input.daily_goal, 3));

  if (input.sound_enabled !== undefined) updates.sound_enabled = Boolean(input.sound_enabled);
  if (input.onboarding_done !== undefined) updates.onboarding_done = Boolean(input.onboarding_done);

  if (input.last_task_at !== undefined && input.last_task_at !== null) {
    if (typeof input.last_task_at === 'number' && Number.isFinite(input.last_task_at)) {
      updates.last_task_at = new Date(input.last_task_at).toISOString();
    } else if (typeof input.last_task_at === 'string' && input.last_task_at.trim()) {
      const parsed = new Date(input.last_task_at);
      if (!Number.isNaN(parsed.getTime())) updates.last_task_at = parsed.toISOString();
    }
  } else if (input.last_task_at === null) {
    updates.last_task_at = null;
  }

  if (input.app_state && typeof input.app_state === 'object' && !Array.isArray(input.app_state)) {
    updates.app_state = input.app_state;
  }

  const stageRaw = input.nafs_stage ?? input.nafsStage;
  if (stageRaw !== undefined) {
    const stage = Number(stageRaw);
    if (Number.isInteger(stage) && stage >= 1 && stage <= 7) updates.nafs_stage = stage;
  }

  if (input.nafs_assessed_at !== undefined) {
    if (input.nafs_assessed_at === null) {
      updates.nafs_assessed_at = null;
    } else if (typeof input.nafs_assessed_at === 'string') {
      const parsed = new Date(input.nafs_assessed_at);
      if (!Number.isNaN(parsed.getTime())) updates.nafs_assessed_at = parsed.toISOString();
    }
  }

  return updates;
}

function normalizeChallenges(challengesInput, userId) {
  if (!Array.isArray(challengesInput)) return [];

  const rows = [];
  const seen = new Set();

  challengesInput.forEach((item) => {
    if (!item || typeof item !== 'object') return;

    const frontendId = String(item.frontend_id ?? item.id ?? '').trim();
    const title = String(item.title || '').trim();
    if (!frontendId || !title) return;
    if (seen.has(frontendId)) return;
    seen.add(frontendId);

    rows.push({
      user_id: userId,
      frontend_id: frontendId,
      title,
      category: String(item.category || 'ibadah'),
      base_xp: normalizeNumber(item.base_xp ?? item.xpPerTask ?? 20, 20),
      icon: String(item.icon || '✨'),
    });
  });

  return rows;
}

function normalizeCompletedDays(daysInput, userId) {
  if (!daysInput) return [];

  const rows = [];

  if (Array.isArray(daysInput)) {
    daysInput.forEach((item) => {
      const date = normalizeDateKey(item?.date);
      if (!date) return;

      const challengeIds = Array.isArray(item?.challenge_ids)
        ? item.challenge_ids
        : Array.isArray(item?.challengeIds)
          ? item.challengeIds
          : [];

      rows.push({
        user_id: userId,
        date,
        challenge_ids: [...new Set(challengeIds.map((id) => String(id || '').trim()).filter(Boolean))],
        total_xp: normalizeNumber(item?.total_xp ?? item?.totalXP ?? item?.xp ?? 0, 0),
      });
    });
    return rows;
  }

  if (typeof daysInput === 'object') {
    Object.entries(daysInput).forEach(([dateKey, ids]) => {
      const date = normalizeDateKey(dateKey);
      if (!date) return;
      const challengeIds = Array.isArray(ids) ? ids : [];
      rows.push({
        user_id: userId,
        date,
        challenge_ids: [...new Set(challengeIds.map((id) => String(id || '').trim()).filter(Boolean))],
        total_xp: 0,
      });
    });
  }

  return rows;
}

function normalizePrayerRows(prayerInput, userId) {
  if (!prayerInput) return [];

  const rows = [];

  const pushRow = (dateKey, payload) => {
    const date = normalizeDateKey(dateKey);
    if (!date) return;
    rows.push({
      user_id: userId,
      date,
      fajr: normalizePrayerStatus(payload?.fajr),
      dhuhr: normalizePrayerStatus(payload?.dhuhr),
      asr: normalizePrayerStatus(payload?.asr),
      maghrib: normalizePrayerStatus(payload?.maghrib),
      isha: normalizePrayerStatus(payload?.isha),
    });
  };

  if (Array.isArray(prayerInput)) {
    prayerInput.forEach((item) => pushRow(item?.date, item));
    return rows;
  }

  if (typeof prayerInput === 'object') {
    Object.entries(prayerInput).forEach(([dateKey, payload]) => pushRow(dateKey, payload));
  }

  return rows;
}

function normalizeAchievements(achievementsInput, userId) {
  if (!Array.isArray(achievementsInput)) return [];

  const rows = [];
  const seen = new Set();

  achievementsInput.forEach((item) => {
    let achievementId = '';
    let xpReward = 0;

    if (typeof item === 'string') {
      achievementId = item.trim();
    } else if (item && typeof item === 'object') {
      achievementId = String(item.id ?? item.achievement_id ?? '').trim();
      xpReward = normalizeNumber(item.xp_reward ?? item.xpBonus ?? 0, 0);
    }

    if (!achievementId || seen.has(achievementId)) return;
    seen.add(achievementId);

    rows.push({
      user_id: userId,
      achievement_id: achievementId,
      xp_reward: xpReward,
    });
  });

  return rows;
}

async function getFullData(userId) {
  const [profileRes, challengesRes, daysRes, achRes, prayerRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
    supabaseAdmin.from('active_challenges').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabaseAdmin.from('completed_days').select('date, challenge_ids, total_xp').eq('user_id', userId).order('date', { ascending: true }),
    supabaseAdmin.from('achievements').select('achievement_id, xp_reward, unlocked_at').eq('user_id', userId),
    supabaseAdmin.from('prayer_log').select('date, fajr, dhuhr, asr, maghrib, isha').eq('user_id', userId).order('date', { ascending: true }),
  ]);

  return {
    profile: profileRes.data ?? null,
    challenges: challengesRes.data ?? [],
    completed_days: daysRes.data ?? [],
    achievements: achRes.data ?? [],
    prayer_log: prayerRes.data ?? [],
  };
}

// GET /api/data/full
router.get('/full', requireAuth, async (req, res) => {
  const fullData = await getFullData(req.user.id);
  res.json(fullData);
});

// POST /api/data/sync
router.post('/sync', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const {
    profile,
    challenges,
    completed_days,
    prayer_log,
    achievements,
    replace = false,
  } = req.body || {};

  const normalizedProfile = normalizeProfileUpdates(profile || {});
  const normalizedChallenges = normalizeChallenges(challenges, userId);
  const normalizedDays = normalizeCompletedDays(completed_days, userId);
  const normalizedPrayer = normalizePrayerRows(prayer_log, userId);
  const normalizedAchievements = normalizeAchievements(achievements, userId);

  const summary = {
    profile_updated: 0,
    challenges_synced: 0,
    completed_days_synced: 0,
    prayer_days_synced: 0,
    achievements_synced: 0,
  };

  if (Object.keys(normalizedProfile).length > 0) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update(normalizedProfile)
      .eq('id', userId);
    if (error) return res.status(500).json({ error: 'Profil syncda xato' });
    summary.profile_updated = 1;
  }

  if (normalizedChallenges.length > 0) {
    const { error } = await supabaseAdmin
      .from('active_challenges')
      .upsert(normalizedChallenges, { onConflict: 'user_id,frontend_id' });
    if (error) return res.status(500).json({ error: 'Challenge syncda xato' });
    summary.challenges_synced = normalizedChallenges.length;
  }

  if (replace && Array.isArray(challenges)) {
    const keep = new Set(normalizedChallenges.map((item) => item.frontend_id));
    const { data: existing, error: readError } = await supabaseAdmin
      .from('active_challenges')
      .select('id, frontend_id')
      .eq('user_id', userId);
    if (readError) return res.status(500).json({ error: 'Challenge replace bosqichida xato' });

    const toDelete = (existing || [])
      .filter((item) => !keep.has(item.frontend_id))
      .map((item) => item.id);

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('active_challenges')
        .delete()
        .in('id', toDelete);
      if (deleteError) return res.status(500).json({ error: 'Challenge replace delete xatosi' });
    }
  }

  if (normalizedDays.length > 0) {
    const { error } = await supabaseAdmin
      .from('completed_days')
      .upsert(normalizedDays, { onConflict: 'user_id,date' });
    if (error) return res.status(500).json({ error: 'Completed days syncda xato' });
    summary.completed_days_synced = normalizedDays.length;
  }

  if (replace && completed_days !== undefined) {
    const keep = new Set(normalizedDays.map((item) => item.date));
    const { data: existing, error: readError } = await supabaseAdmin
      .from('completed_days')
      .select('id, date')
      .eq('user_id', userId);
    if (readError) return res.status(500).json({ error: 'Completed days replace bosqichida xato' });

    const toDelete = (existing || [])
      .filter((item) => !keep.has(item.date))
      .map((item) => item.id);

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('completed_days')
        .delete()
        .in('id', toDelete);
      if (deleteError) return res.status(500).json({ error: 'Completed days replace delete xatosi' });
    }
  }

  if (normalizedPrayer.length > 0) {
    const { error } = await supabaseAdmin
      .from('prayer_log')
      .upsert(normalizedPrayer, { onConflict: 'user_id,date' });
    if (error) return res.status(500).json({ error: 'Prayer syncda xato' });
    summary.prayer_days_synced = normalizedPrayer.length;
  }

  if (replace && prayer_log !== undefined) {
    const keep = new Set(normalizedPrayer.map((item) => item.date));
    const { data: existing, error: readError } = await supabaseAdmin
      .from('prayer_log')
      .select('id, date')
      .eq('user_id', userId);
    if (readError) return res.status(500).json({ error: 'Prayer replace bosqichida xato' });

    const toDelete = (existing || [])
      .filter((item) => !keep.has(item.date))
      .map((item) => item.id);

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('prayer_log')
        .delete()
        .in('id', toDelete);
      if (deleteError) return res.status(500).json({ error: 'Prayer replace delete xatosi' });
    }
  }

  if (normalizedAchievements.length > 0) {
    const { error } = await supabaseAdmin
      .from('achievements')
      .upsert(normalizedAchievements, { onConflict: 'user_id,achievement_id' });
    if (error) return res.status(500).json({ error: 'Achievement syncda xato' });
    summary.achievements_synced = normalizedAchievements.length;
  }

  if (replace && achievements !== undefined) {
    const keep = new Set(normalizedAchievements.map((item) => item.achievement_id));
    const { data: existing, error: readError } = await supabaseAdmin
      .from('achievements')
      .select('id, achievement_id')
      .eq('user_id', userId);
    if (readError) return res.status(500).json({ error: 'Achievement replace bosqichida xato' });

    const toDelete = (existing || [])
      .filter((item) => !keep.has(item.achievement_id))
      .map((item) => item.id);

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('achievements')
        .delete()
        .in('id', toDelete);
      if (deleteError) return res.status(500).json({ error: 'Achievement replace delete xatosi' });
    }
  }

  const fullData = await getFullData(userId);
  res.json({ ...summary, data: fullData });
});

export default router;
