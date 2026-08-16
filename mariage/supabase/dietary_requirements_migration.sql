-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Migration additive : les anciennes inscriptions restent intactes et conservent
-- dietary_requirements à NULL tant que les invités n'ont pas complété cette question.

alter table public.wedding_responses
  add column if not exists dietary_requirements jsonb;

alter table public.wedding_responses
  drop constraint if exists wedding_responses_dietary_requirements_is_array;

alter table public.wedding_responses
  add constraint wedding_responses_dietary_requirements_is_array
  check (
    dietary_requirements is null
    or jsonb_typeof(dietary_requirements) = 'array'
  );

comment on column public.wedding_responses.dietary_requirements is
  'Réponses alimentaires par participant. NULL signifie que la question n’a pas encore été renseignée.';

notify pgrst, 'reload schema';
