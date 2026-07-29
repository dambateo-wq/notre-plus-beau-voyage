export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("La connexion au questionnaire n’est pas configurée.");
  }

  return {
    url,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  };
}
