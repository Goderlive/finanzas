-- =====================================================================
-- Fase 1 · 0009 · Fix: al borrar un perfil, sus invitaciones se eliminan
-- =====================================================================
-- Antes, borrar un usuario (auth.users -> cascade a profiles) fallaba si
-- había generado invitaciones, porque invited_by no tenía ON DELETE.

alter table public.household_invitations
  drop constraint household_invitations_invited_by_fkey,
  add constraint household_invitations_invited_by_fkey
    foreign key (invited_by) references public.profiles (id) on delete cascade;
