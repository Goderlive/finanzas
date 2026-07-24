-- =====================================================================
-- Fase 1 · 0008 · Onboarding de auth: alta de perfil, hogar, invitaciones
-- =====================================================================

-- Al crear un usuario en auth.users, crear su perfil (sin hogar aún)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Crear un hogar y hacer al usuario actual su dueño.
-- Solo permitido si el usuario aún no pertenece a ningún hogar.
create or replace function public.create_household(p_name text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and household_id is not null) then
    raise exception 'El usuario ya pertenece a un hogar';
  end if;

  insert into public.households (name) values (p_name) returning id into v_household;

  update public.profiles
     set household_id = v_household,
         role         = 'owner',
         display_name = coalesce(p_display_name, display_name)
   where id = auth.uid();

  return v_household;
end;
$$;

-- Crear una invitación para el segundo usuario. Devuelve el token.
create or replace function public.create_invitation(p_email citext)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_token     uuid;
begin
  v_household := public.current_household_id();
  if v_household is null then
    raise exception 'El usuario no pertenece a ningún hogar';
  end if;

  insert into public.household_invitations (household_id, email, invited_by)
  values (v_household, p_email, auth.uid())
  on conflict (household_id, email)
    do update set status     = 'pending',
                  token      = gen_random_uuid(),
                  expires_at = now() + interval '7 days',
                  invited_by = auth.uid(),
                  accepted_at = null
  returning token into v_token;

  return v_token;
end;
$$;

-- Aceptar una invitación por token. Asigna el hogar al perfil del invitado.
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv public.household_invitations;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_inv
    from public.household_invitations
   where token = p_token
   for update;

  if v_inv.id is null then
    raise exception 'Invitación no encontrada';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'La invitación no está pendiente';
  end if;
  if v_inv.expires_at < now() then
    update public.household_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'La invitación expiró';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and household_id is not null) then
    raise exception 'El usuario ya pertenece a un hogar';
  end if;

  update public.profiles
     set household_id = v_inv.household_id,
         role         = 'member'
   where id = auth.uid();

  update public.household_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;

  return v_inv.household_id;
end;
$$;
