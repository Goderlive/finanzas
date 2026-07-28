-- =====================================================================
-- Fase 3 · 0017 · 'loan' como tipo de cuenta
--
-- ADITIVA: sólo agrega un valor al enum account_type.
--
-- Va en su propio archivo a propósito: `alter type ... add value` no puede
-- usarse dentro de la misma transacción que lo declara, y la migración 0018
-- necesita referirse a 'loan' en la expresión de una columna generada.
-- =====================================================================

alter type public.account_type add value if not exists 'loan';
