import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const POSITIVE_PRAYER_STATUSES = new Set(['on_time', 'jamaat']);
const LEGACY_STATUS_MAP = {
  late: 'on_time',
  skipped: 'missed',
};

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDateKey(value) {
  const date = String(value || '').trim();
  return DATE_KEY_RE.test(date) ? date : null;
}

function parseRangeEnd(value) {
  const normalized = normalizeDateKey(value);
  if (!normalized) return new Date();
  return new Date(`${normalized}T00:00:00.000Z`);
}

function clampRangeDays(value, fallback = 7) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(30, Math.max(1, Math.round(parsed)));
}

function normalizePrayerStatus(value) {
  if (value === null || value === undefined || value === '') return 'pending';
  const raw = String(value).trim().toLowerCase();
  return LEGACY_STATUS_MAP[raw] || raw;
}

function buildDateRange(endDate, dayCount) {
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (dayCount - 1));

  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { start, end, keys };
}

function getStreaks(flags) {
  let best = 0;
  let chain = 0;

  flags.forEach((flag) => {
    if (flag) {
      chain += 1;
      best = Math.max(best, chain);
    } else {
      chain = 0;
    }
  });

  let current = 0;
  for (let i = flags.length - 1; i >= 0; i -= 1) {
    if (!flags[i]) break;
    current += 1;
  }

  return { best, current };
}

// GET /api/stats/weekly?end=YYYY-MM-DD&days=7
router.get('/weekly', requireAuth, async (req, res) => {
  const dayCount = clampRangeDays(req.query.days, 7);
  const rangeEnd = parseRangeEnd(req.query.end);
  const { start, end, keys } = buildDateRange(rangeEnd, dayCount);

  const startKey = toDateKey(start);
  const endKey = toDateKey(end);

  const [profileRes, completedRes, prayerRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('xp, streak, daily_goal')
      .eq('id', req.user.id)
      .single(),
    supabaseAdmin
      .from('completed_days')
      .select('date, challenge_ids, total_xp')
      .eq('user_id', req.user.id)
      .gte('date', startKey)
      .lte('date', endKey)
      .order('date', { ascending: true }),
    supabaseAdmin
      .from('prayer_log')
      .select('date, fajr, dhuhr, asr, maghrib, isha')
      .eq('user_id', req.user.id)
      .gte('date', startKey)
      .lte('date', endKey)
      .order('date', { ascending: true }),
  ]);

  if (profileRes.error) return res.status(500).json({ error: 'Profil statistikani olishda xato' });
  if (completedRes.error) return res.status(500).json({ error: 'Topshiriq statistikani olishda xato' });
  if (prayerRes.error) return res.status(500).json({ error: "Namoz statistikani olishda xato" });

  const dailyGoal = Math.max(1, Number(profileRes.data?.daily_goal) || 3);

  const completedByDate = new Map(
    (completedRes.data || []).map((row) => [row.date, row]),
  );

  const prayerByDate = new Map(
    (prayerRes.data || []).map((row) => [row.date, row]),
  );

  const daily = keys.map((date) => {
    const completedRow = completedByDate.get(date);
    const prayerRow = prayerByDate.get(date);

    const challengeIds = Array.isArray(completedRow?.challenge_ids)
      ? completedRow.challenge_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    const taskCount = challengeIds.length;
    const taskDone = taskCount > 0;

    const statuses = PRAYERS.map((prayer) => normalizePrayerStatus(prayerRow?.[prayer]));
    const prayerTracked = statuses.filter((status) => status !== 'pending').length;
    const prayerPositive = statuses.filter((status) => POSITIVE_PRAYER_STATUSES.has(status)).length;
    const prayerQaza = statuses.filter((status) => status === 'qaza').length;
    const prayerMissed = statuses.filter((status) => status === 'missed').length;
    const prayerPerfect = prayerPositive === PRAYERS.length;
    const prayerScorePercent = Math.round((prayerPositive / PRAYERS.length) * 100);

    return {
      date,
      task_count: taskCount,
      task_done: taskDone,
      goal_hit: taskCount >= dailyGoal,
      challenge_ids: challengeIds,
      prayer_tracked: prayerTracked,
      prayer_positive: prayerPositive,
      prayer_qaza: prayerQaza,
      prayer_missed: prayerMissed,
      prayer_perfect: prayerPerfect,
      prayer_score_percent: prayerScorePercent,
    };
  });

  const taskFlags = daily.map((item) => item.task_done);
  const prayerPerfectFlags = daily.map((item) => item.prayer_perfect);
  const taskStreaks = getStreaks(taskFlags);
  const prayerStreaks = getStreaks(prayerPerfectFlags);

  const summary = {
    total_days: dayCount,
    active_task_days: daily.filter((item) => item.task_done).length,
    total_tasks: daily.reduce((sum, item) => sum + item.task_count, 0),
    goal_hit_days: daily.filter((item) => item.goal_hit).length,
    prayer_tracked_total: daily.reduce((sum, item) => sum + item.prayer_tracked, 0),
    prayer_positive_total: daily.reduce((sum, item) => sum + item.prayer_positive, 0),
    prayer_qaza_total: daily.reduce((sum, item) => sum + item.prayer_qaza, 0),
    prayer_missed_total: daily.reduce((sum, item) => sum + item.prayer_missed, 0),
    prayer_perfect_days: daily.filter((item) => item.prayer_perfect).length,
    prayer_discipline_percent: Math.round(
      (daily.reduce((sum, item) => sum + item.prayer_positive, 0) / (dayCount * PRAYERS.length)) * 100,
    ),
    task_streak_current: taskStreaks.current,
    task_streak_best: taskStreaks.best,
    prayer_streak_current: prayerStreaks.current,
    prayer_streak_best: prayerStreaks.best,
  };

  res.json({
    range: {
      start: startKey,
      end: endKey,
      days: dayCount,
    },
    profile: {
      xp: profileRes.data?.xp ?? 0,
      streak: profileRes.data?.streak ?? 0,
      daily_goal: dailyGoal,
    },
    summary,
    daily,
  });
});

export default router;
