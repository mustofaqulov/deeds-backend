import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// POST /api/nafs/assess — nafs bosqichini o'zi tanlash va saqlash
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
      nafs_stage:       stage_id,
      nafs_assessed_at: new Date().toISOString(),
    })
    .eq('id', req.user.id)
    .select('nafs_stage, nafs_assessed_at')
    .single();

  if (error) return res.status(500).json({ error: 'Nafs darajasini saqlashda xato' });
  res.json(data);
});

// GET /api/nafs — hozirgi nafs darajasini olish
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('nafs_stage, nafs_assessed_at')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(404).json({ error: 'Profil topilmadi' });
  res.json(data);
});

export default router;
