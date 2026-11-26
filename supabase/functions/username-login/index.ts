import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return response({ error: 'Nem támogatott művelet.' }, 405);
  try {
    const { username, password } = await req.json();
    if (typeof username !== 'string' || typeof password !== 'string' ||
      !/^[a-z0-9._-]{3,30}$/.test(username.toLowerCase()) || password.length > 200) {
      return response({ error: 'Hibás felhasználónév vagy jelszó.' }, 401);
    }
    const url = Deno.env.get('SUPABASE_URL')!;
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, secretKey, { auth: { persistSession: false } });
    const { data: profile } = await admin.from('profiles')
      .select('email, is_active').eq('username', username.toLowerCase()).maybeSingle();
    if (!profile?.is_active) return response({ error: 'Hibás felhasználónév vagy jelszó.' }, 401);

    const anon = createClient(url, publicKey, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: profile.email, password });
    if (error || !data.session) return response({ error: 'Hibás felhasználónév vagy jelszó.' }, 401);
    return response({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    return response({ error: 'A bejelentkezés nem sikerült.' }, 400);
  }
});
