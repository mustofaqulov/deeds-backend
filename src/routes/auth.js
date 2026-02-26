import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, city = 'Toshkent' } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email va password majburiy' });
  }

  // 1. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes('already')) {
      return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }
    return res.status(400).json({ error: authError.message });
  }

  const userId = authData.user.id;

  // 2. Create profile
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    name,
    email,
    city,
    xp: 50, // Onboarding gift
    tasbeh: 0,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: 'Profil yaratishda xato' });
  }

  // 3. Sign in to get session
  const { data: session, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return res.status(500).json({ error: 'Ro\'yxatdan o\'tildi, lekin kirishda xato' });
  }

  const profile = await getFullProfile(userId);

  res.status(201).json({
    message: 'Muvaffaqiyatli ro\'yxatdan o\'tildi',
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    user: profile,
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email va password majburiy' });
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
  }

  const profile = await getFullProfile(data.user.id);

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: profile,
  });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token majburiy' });

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: 'Token yangilab bo\'lmadi' });

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.slice(7);
  if (token) await supabaseAdmin.auth.admin.signOut(token);
  res.json({ message: 'Chiqildi' });
});

// --- Helper ---
async function getFullProfile(userId) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export default router;
