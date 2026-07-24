-- =====================================================================
-- Fase 1 · 0002 · Núcleo: hogares, perfiles, invitaciones
-- =====================================================================

-- Un hogar con moneda base
create table public.households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  base_currency char(3) not null default 'MXN',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Perfiles vinculados 1:1 a auth.users; pertenecen a un hogar
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  role         public.member_role not null default 'member',
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_household_idx on public.profiles (household_id);

-- Invitación para el segundo usuario (email + token secreto)
create table public.household_invitations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email        citext not null,
  token        uuid not null default gen_random_uuid(),
  invited_by   uuid not null references public.profiles (id),
  status       public.invitation_status not null default 'pending',
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (household_id, email)
);
create index invitations_token_idx on public.household_invitations (token);
