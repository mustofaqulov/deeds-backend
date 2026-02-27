import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// PUT /api/userdata
// Video notes/progress/watched, prayer debt, tasbeh data saqlash
router.put('/', requireAuth, async (req, res) => {
  const { video_notes, video_progress, watched_videos, prayer_debt, tasbeh_data } = req.body || {};

  const updates = {};

  if (video_notes !== undefined) {
    if (!isPlainObject(video_notes)) return res.status(400).json({ error: 'video_notes object bolishi kerak' });
    // Faqat string qiymatlarni qabul qilish (note text)
    const clean = {};
    for (const [k, v] of Object.entries(video_notes)) {
      if (typeof v === 'string') clean[String(k)] = v;
    }
    updates.video_notes = clean;
  }

  if (video_progress !== undefined) {
    if (!isPlainObject(video_progress)) return res.status(400).json({ error: 'video_progress object bolishi kerak' });
    const clean = {};
    for (const [k, v] of Object.entries(video_progress)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) clean[String(k)] = Math.round(n);
    }
    updates.video_progress = clean;
  }

  if (watched_videos !== undefined) {
    if (!isPlainObject(watched_videos)) return res.status(400).json({ error: 'watched_videos object bolishi kerak' });
    const clean = {};
    for (const [k, v] of Object.entries(watched_videos)) {
      if (v) clean[String(k)] = true;
    }
    updates.watched_videos = clean;
  }

  if (prayer_debt !== undefined) {
    if (!isPlainObject(prayer_debt)) return res.status(400).json({ error: 'prayer_debt object bolishi kerak' });
    const debt = {};
    for (const p of PRAYERS) {
      const n = Number(prayer_debt[p]);
      debt[p] = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    }
    updates.prayer_debt = debt;
  }

  if (tasbeh_data !== undefined) {
    if (!isPlainObject(tasbeh_data)) return res.status(400).json({ error: 'tasbeh_data object bolishi kerak' });
    updates.tasbeh_data = tasbeh_data;
  }

  if (Object.keys(updates).length === 0) return res.json({ ok: true });

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', req.user.id);

  if (error) {
    console.error('userdata save error:', error);
    return res.status(500).json({ error: "Ma'lumotlarni saqlashda xato" });
  }

  res.json({ ok: true });
});

// GET /api/userdata
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('video_notes, video_progress, watched_videos, prayer_debt, tasbeh_data')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(500).json({ error: "Ma'lumotlarni olishda xato" });

  res.json({
    video_notes:    data.video_notes    ?? {},
    video_progress: data.video_progress ?? {},
    watched_videos: data.watched_videos ?? {},
    prayer_debt:    data.prayer_debt    ?? {},
    tasbeh_data:    data.tasbeh_data    ?? {},
  });
});

export default router;
