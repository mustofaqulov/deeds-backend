import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_STATUSES = ['pending', 'on_time', 'jamaat', 'qaza', 'missed'];
const LEGACY_TO_CURRENT = {
  late: 'on_time',
  skipped: 'missed',
};

function normalizeDateKey(value) {
  const date = String(value || '').trim();
  return DATE_KEY_RE.test(date) ? date : null;
}

function normalizeStatus(value) {
  if (value === null || value === undefined || value === '') return 'pending';
  const raw = String(value).trim().toLowerCase();
  const mapped = LEGACY_TO_CURRENT[raw] || raw;
  return VALID_STATUSES.includes(mapped) ? mapped : 'pending';
}

function normalizePrayerPayload(payload = {}) {
  return {
    fajr: normalizeStatus(payload.fajr),
    dhuhr: normalizeStatus(payload.dhuhr),
    asr: normalizeStatus(payload.asr),
    maghrib: normalizeStatus(payload.maghrib),
    isha: normalizeStatus(payload.isha),
  };
}

function normalizePrayerRow(row = {}) {
  const normalized = normalizePrayerPayload(row);
  return {
    ...row,
    ...normalized,
  };
}

function isPositiveStatus(status) {
  return status === 'on_time' || status === 'jamaat';
}

// GET /api/prayer/streak/current
router.get('/streak/current', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .select('date, fajr, dhuhr, asr, maghrib, isha')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false })
    .limit(90);

  if (error) return res.status(500).json({ error: "Streak hisoblab bo'lmadi" });

  let streak = 0;
  for (const row of (data || [])) {
    const normalized = normalizePrayerRow(row);
    const allDone = PRAYERS.every((prayer) => isPositiveStatus(normalized[prayer]));
    if (!allDone) break;
    streak += 1;
  }

  res.json({ streak });
});

// GET /api/prayer/:date
router.get('/:date', requireAuth, async (req, res) => {
  const date = normalizeDateKey(req.params.date);
  if (!date) return res.status(400).json({ error: 'date formati YYYY-MM-DD bo\'lishi kerak' });

  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('date', date)
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Namoz ma'lumotlarini yuklashda xato" });

  if (!data) {
    return res.json({
      date,
      fajr: 'pending',
      dhuhr: 'pending',
      asr: 'pending',
      maghrib: 'pending',
      isha: 'pending',
    });
  }

  res.json(normalizePrayerRow(data));
});

// PUT /api/prayer/:date (bulk sync)
router.put('/:date', requireAuth, async (req, res) => {
  const date = normalizeDateKey(req.params.date);
  if (!date) return res.status(400).json({ error: 'date formati YYYY-MM-DD bo\'lishi kerak' });

  const statuses = normalizePrayerPayload(req.body || {});
  const record = {
    user_id: req.user.id,
    date,
    ...statuses,
  };

  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .upsert(record, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Namozni saqlashda xato" });
  res.json(normalizePrayerRow(data));
});

// PUT /api/prayer/:date/:prayer
router.put('/:date/:prayer', requireAuth, async (req, res) => {
  const date = normalizeDateKey(req.params.date);
  const prayer = String(req.params.prayer || '').trim().toLowerCase();
  const status = normalizeStatus(req.body?.status);

  if (!date) return res.status(400).json({ error: 'date formati YYYY-MM-DD bo\'lishi kerak' });
  if (!PRAYERS.includes(prayer)) {
    return res.status(400).json({ error: `Namoz nomi noto'g'ri. Mumkin: ${PRAYERS.join(', ')}` });
  }

  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .upsert(
      { user_id: req.user.id, date, [prayer]: status },
      { onConflict: 'user_id,date' },
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Namozni saqlashda xato" });
  res.json(normalizePrayerRow(data));
});

export default router;
