import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

function safeString(value, fallback = '') {
  const out = String(value || '').trim();
  return out || fallback;
}

async function getProfileById(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Profilni olishda xato');
  return data || null;
}

async function ensureProfile(user, defaults = {}) {
  const existing = await getProfileById(user.id);
  if (existing) return existing;

  const profilePayload = {
    id: user.id,
    name: safeString(defaults.name || user.user_metadata?.name, 'Foydalanuvchi'),
    email: safeString(defaults.email || user.email),
    city: safeString(defaults.city, 'Toshkent'),
    xp: typeof defaults.xp === 'number' ? defaults.xp : 50,
    streak: 0,
    tasbeh: 0,
    daily_goal: 3,
    sound_enabled: true,
    onboarding_done: false,
    app_state: {},
  };

  const { error } = await supabaseAdmin
    .from('profiles')
    .insert(profilePayload);

  if (error) throw new Error(error.message || 'Profil yaratishda xato');
  return getProfileById(user.id);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, city = 'Toshkent' } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email va password majburiy' });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: safeString(name) },
  });

  if (authError) {
    if (String(authError.message || '').toLowerCase().includes('already')) {
      return res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
    }
    return res.status(400).json({ error: authError.message || "Ro'yxatdan o'tishda xato" });
  }

  const userId = authData.user.id;

  try {
    await ensureProfile(authData.user, { name, email, city, xp: 50 });
  } catch (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: profileErr.message || 'Profil yaratishda xato' });
  }

  const { data: session, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session?.session) {
    return res.status(500).json({ error: "Ro'yxatdan o'tildi, lekin kirishda xato" });
  }

  const profile = await getProfileById(userId);

  res.status(201).json({
    message: "Muvaffaqiyatli ro'yxatdan o'tildi",
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    user: profile,
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email va password majburiy' });
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !data?.user) {
    return res.status(401).json({ error: "Email yoki parol noto'g'ri" });
  }

  let profile = null;
  try {
    profile = await ensureProfile(data.user, { email, name: data.user.user_metadata?.name });
  } catch (profileErr) {
    return res.status(500).json({ error: profileErr.message || 'Profilni tayyorlashda xato' });
  }

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: profile,
  });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token majburiy' });

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });
  if (error || !data?.session) return res.status(401).json({ error: "Token yangilab bo'lmadi" });

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    await supabaseAdmin.auth.admin.signOut(token).catch(() => {});
  }
  res.json({ message: 'Chiqildi' });
});

export default router;
