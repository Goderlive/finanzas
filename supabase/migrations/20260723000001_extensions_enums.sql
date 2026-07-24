-- =====================================================================
-- Fase 1 · 0001 · Extensiones y tipos enumerados
-- =====================================================================

-- Extensiones
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- emails case-insensitive
create extension if not exists pg_trgm;    -- autocompletado de descripciones (ILIKE)

-- Enums de dominio
create type public.account_type as enum
  ('checking', 'savings', 'cash', 'credit_card', 'investment', 'other');

create type public.transaction_type as enum
  ('income', 'expense', 'transfer');

create type public.category_kind as enum
  ('income', 'expense');

create type public.split_type as enum
  ('equal', 'percentage', 'fixed');   -- 'equal' = 50/50

create type public.debt_type as enum
  ('loan', 'credit_card', 'mortgage', 'other');

create type public.member_role as enum
  ('owner', 'member');

create type public.invitation_status as enum
  ('pending', 'accepted', 'revoked', 'expired');
