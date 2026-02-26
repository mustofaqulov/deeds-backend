import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const VALID_STATUSES = ['pending', 'on_time', 'late', 'qaza', 'skipped'];

// GET /api/prayer/:date — get prayer log for a date
router.get('/:date', requireAuth, async (req, res) => {
  const { date } = req.params;
  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('date', date)
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Namoz ma'lumotlarini yuklashda xato" });

  // Return empty defaults if no record yet
  if (!data) {
    return res.json({ date, fajr: 'pending', dhuhr: 'pending', asr: 'pending', maghrib: 'pending', isha: 'pending' });
  }
  res.json(data);
});

// PUT /api/prayer/:date — butun kunni upsert qilish (bulk sync)
router.put('/:date', requireAuth, async (req, res) => {
  const { date } = req.params;
  const { fajr, dhuhr, asr, maghrib, isha } = req.body;

  const toStatus = (v) => (VALID_STATUSES.includes(v) ? v : 'pending');

  const record = {
    user_id: req.user.id,
    date,
    fajr:    toStatus(fajr),
    dhuhr:   toStatus(dhuhr),
    asr:     toStatus(asr),
    maghrib: toStatus(maghrib),
    isha:    toStatus(isha),
  };

  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .upsert(record, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Namozni saqlashda xato" });
  res.json(data);
});

// PUT /api/prayer/:date/:prayer — bitta namozni yangilash
router.put('/:date/:prayer', requireAuth, async (req, res) => {
  const { date, prayer } = req.params;
  const { status } = req.body;

  if (!PRAYERS.includes(prayer)) {
    return res.status(400).json({ error: `Namoz nomi noto'g'ri. Mumkin: ${PRAYERS.join(', ')}` });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status noto'g'ri. Mumkin: ${VALID_STATUSES.join(', ')}` });
  }

  const userId = req.user.id;

  // Upsert the row, update only the relevant prayer column
  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .upsert(
      { user_id: userId, date, [prayer]: status },
      { onConflict: 'user_id,date', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Namozni saqlashda xato" });
  res.json(data);
});

// GET /api/prayer/streak/current — prayer streak (consecutive days with all 5 prayers done)
router.get('/streak/current', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('prayer_log')
    .select('date, fajr, dhuhr, asr, maghrib, isha')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false })
    .limit(60);

  if (error) return res.status(500).json({ error: "Streak hisoblab bo'lmadi" });

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const row of (data ?? [])) {
    const allDone = PRAYERS.every(p => row[p] === 'on_time' || row[p] === 'late');
    if (!allDone) break;
    streak++;
  }

  res.json({ streak });
});

export default router;
