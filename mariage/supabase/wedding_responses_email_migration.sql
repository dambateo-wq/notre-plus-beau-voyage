-- À exécuter une fois dans Supabase > SQL Editor.
alter table public.wedding_responses
  add column if not exists respondent_email text;

notify pgrst, 'reload schema';
