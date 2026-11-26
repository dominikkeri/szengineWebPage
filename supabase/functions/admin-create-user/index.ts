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
    const url = Deno.env.get('SUPABASE_URL')!;
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, secretKey, { auth: { persistSession: false } });
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!bearer) return response({ error: 'Nincs hitelesítés.' }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return response({ error: 'Érvénytelen munkamenet.' }, 401);
    const { data: caller } = await admin.from('profiles')
      .select('role, is_active').eq('id', authData.user.id).single();
    if (!caller?.is_active || caller.role !== 'admin') return response({ error: 'Csak adminisztrátornak engedélyezett.' }, 403);

    const { username, email, password, role } = await req.json();
    if (typeof username !== 'string' || !/^[a-z0-9._-]{3,30}$/.test(username) ||
      typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== 'string' || password.length < 10 || password.length > 200 ||
      !['admin', 'operator', 'viewer'].includes(role)) {
      return response({ error: 'Hibás adatok. A jelszó legalább 10 karakter legyen.' }, 400);
    }
    const { data: userCreation, error: createError } = await admin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (createError || !userCreation.user) {
      return response({ error: createError?.message ?? 'Nem sikerült létrehozni a felhasználót.' }, 400);
    }
    const { error: roleError } = await admin.from('profiles')
      .update({ role }).eq('id', userCreation.user.id);
    if (roleError) {
      await admin.auth.admin.deleteUser(userCreation.user.id);
      return response({ error: 'Nem sikerült beállítani a jogosultságot.' }, 500);
    }
    return response({ success: true, username }, 201);
  } catch {
    return response({ error: 'Szerveroldali hiba.' }, 500);
  }
});
