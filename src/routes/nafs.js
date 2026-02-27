import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

const DEFAULT_ULAMA_ADVICE = [
  {
    id: 'aajurri-evidence',
    scholar: 'Imom al-Ajurri',
    work: 'Adab an-Nufus',
    advice: "Nafs tarbiyasi Qur'on, Sunnat va ilm asosida bo'lishi kerak.",
    action: "Har bir bosqichga kamida 1 dalil yozib boring va amaliyotni dalil bilan bog'lang.",
    source: 'https://islamqa.info/en/answers/178627',
  },
  {
    id: 'ibn-qayyim-mujahid',
    scholar: 'Ibn al-Qayyim (naql sharhi orqali)',
    work: 'Mujohada an-nafs mavzusi',
    advice: "Nafsga qarshi kurash bir martalik emas, doimiy intizomli jarayon.",
    action: "Har kuni bitta qarshi-amal tanlang: nafs istaganini kechiktiring yoki me'yorlang.",
    source: 'https://islamqa.info/en/answers/202449',
  },
  {
    id: 'ghazali-riyada',
    scholar: "Imom al-G'azzoliy",
    work: "Ihya' Ulum ad-Din (XXII-XXIII)",
    advice: "Qalb kasalliklari davosi muntazam muhasaba va shahvatni boshqarish bilan keladi.",
    action: "Haftasiga 1 marta xulosa yozing: qaysi odat qalbni og'irlashtiryapti?",
    source: 'https://openlibrary.org/books/OL4018725M/On_disciplining_the_soul',
  },
];

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeAdviceItem(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;

  const scholar = String(raw.scholar || '').trim();
  const work = String(raw.work || '').trim();
  const advice = String(raw.advice || '').trim();
  const action = String(raw.action || '').trim();
  const source = String(raw.source || '').trim();

  if (!scholar || !advice || !action) return null;

  const idRaw = String(raw.id || '').trim();
  const safeId = idRaw || `${slugify(scholar)}-${index + 1}`;

  return {
    id: safeId || `ulama-${Date.now()}-${index}`,
    scholar,
    work: work || "Noma'lum manba",
    advice,
    action,
    source: source || '#',
    sort_order: Math.max(0, Number(raw.sort_order ?? index) || index),
    is_active: raw.is_active !== false,
  };
}

function normalizeAdviceList(list, fallback = DEFAULT_ULAMA_ADVICE) {
  const source = Array.isArray(list) ? list : fallback;
  const seen = new Set();
  return source
    .map((item, index) => normalizeAdviceItem(item, index))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function isNafsAdmin(user) {
  const allowed = String(process.env.NAFS_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  const email = String(user?.email || '').trim().toLowerCase();
  return !!email && allowed.includes(email);
}

async function fetchUlamaAdvice() {
  const { data, error } = await supabaseAdmin
    .from('nafs_ulama_advice')
    .select('id, scholar, work, advice, action, source, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message || 'Nasihatlarni olishda xato');

  const normalized = normalizeAdviceList(data || [], []);
  if (normalized.length > 0) return normalized;
  return normalizeAdviceList(DEFAULT_ULAMA_ADVICE);
}

async function seedUlamaAdviceIfEmpty() {
  const { data, error } = await supabaseAdmin
    .from('nafs_ulama_advice')
    .select('id')
    .limit(1);

  if (error) throw new Error(error.message || 'Nasihatlar jadvalini tekshirishda xato');
  if ((data || []).length > 0) return;

  const rows = normalizeAdviceList(DEFAULT_ULAMA_ADVICE).map((item, index) => ({
    ...item,
    sort_order: index,
    is_active: true,
    updated_by: null,
  }));

  const { error: insertError } = await supabaseAdmin
    .from('nafs_ulama_advice')
    .upsert(rows, { onConflict: 'id' });

  if (insertError) throw new Error(insertError.message || 'Standart nasihatlarni seed qilishda xato');
}

// POST /api/nafs/assess
router.post('/assess', requireAuth, async (req, res) => {
  const { stage_id } = req.body;

  if (
    !stage_id
    || typeof stage_id !== 'number'
    || !Number.isInteger(stage_id)
    || stage_id < 1
    || stage_id > 7
  ) {
    return res.status(400).json({ error: "stage_id 1-7 oralig'ida butun son bo'lishi kerak" });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      nafs_stage: stage_id,
      nafs_assessed_at: new Date().toISOString(),
    })
    .eq('id', req.user.id)
    .select('nafs_stage, nafs_assessed_at')
    .single();

  if (error) return res.status(500).json({ error: 'Nafs darajasini saqlashda xato' });
  res.json({
    nafs_stage: data?.nafs_stage ?? stage_id,
    nafs_assessed_at: data?.nafs_assessed_at ?? new Date().toISOString(),
  });
});

// GET /api/nafs/ulama
router.get('/ulama', requireAuth, async (_req, res) => {
  try {
    await seedUlamaAdviceIfEmpty();
    const items = await fetchUlamaAdvice();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Ulamolar nasihatini yuklashda xato' });
  }
});

// PUT /api/nafs/ulama (admin only)
router.put('/ulama', requireAuth, async (req, res) => {
  if (!isNafsAdmin(req.user)) {
    return res.status(403).json({ error: 'Bu amal faqat admin uchun ruxsat etilgan' });
  }

  const items = normalizeAdviceList(req.body?.items, []);
  if (!Array.isArray(req.body?.items)) {
    return res.status(400).json({ error: 'items massiv bo\'lishi kerak' });
  }

  const rows = items.map((item, index) => ({
    id: item.id,
    scholar: item.scholar,
    work: item.work,
    advice: item.advice,
    action: item.action,
    source: item.source,
    sort_order: index,
    is_active: true,
    updated_by: req.user.id,
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from('nafs_ulama_advice')
      .upsert(rows, { onConflict: 'id' });

    if (upsertError) {
      return res.status(500).json({ error: upsertError.message || 'Nasihatlarni saqlashda xato' });
    }
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('nafs_ulama_advice')
    .select('id');

  if (existingError) {
    return res.status(500).json({ error: existingError.message || 'Eski nasihatlarni tekshirishda xato' });
  }

  const keep = new Set(rows.map((row) => row.id));
  const toDelete = (existing || [])
    .map((item) => item.id)
    .filter((id) => !keep.has(id));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('nafs_ulama_advice')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message || 'Eski nasihatlarni o\'chirishda xato' });
    }
  }

  try {
    const nextItems = await fetchUlamaAdvice();
    res.json({ items: nextItems, updated: nextItems.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Yangilangan nasihatni qaytarishda xato' });
  }
});

// GET /api/nafs
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('nafs_stage, nafs_assessed_at')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(404).json({ error: 'Profil topilmadi' });
  res.json({
    nafs_stage: data?.nafs_stage ?? null,
    nafs_assessed_at: data?.nafs_assessed_at ?? null,
  });
});

export default router;
