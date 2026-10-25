-- Aligne la validation des présences avec les choix du formulaire.
-- À appliquer dans Supabase > SQL Editor ; un déploiement Vercel seul
-- n'exécute pas les migrations SQL.
-- Conserve le samedi historique et toutes les inscriptions existantes.
-- La transaction restaure la règle précédente si une vérification échoue.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.wedding_responses
  drop constraint if exists valid_attendance_days,
  add constraint valid_attendance_days
  check (
    attendance_days::text[] <@ array[
      '2027-05-28',
      '2027-05-29',
      '2027-05-29-morning',
      '2027-05-29-afternoon',
      '2027-05-30'
    ]::text[]
  );

commit;
