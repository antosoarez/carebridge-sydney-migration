-- Extend lifecycle enum with new pipeline stages used by automation engine
ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Booked';
ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Awaiting agreements';
ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Awaiting payment';
