create type public.payment_status as enum (
  'received',
  'verified',
  'rejected'
);

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  client_submission_id uuid not null unique,
  guest_name varchar(100) not null,
  amount numeric(12, 2),
  drive_file_id text not null unique,
  original_filename varchar(255) not null,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  file_size integer not null check (
    file_size > 0 and file_size <= 5242880
  ),
  event_title varchar(200),
  status public.payment_status not null default 'received',
  host_note text,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  constraint payment_submissions_amount_check check (
    amount is null or (amount >= 0.01 and amount <= 999999.99)
  )
);

create index payment_submissions_submitted_at_idx
  on public.payment_submissions (submitted_at desc);

alter table public.payment_submissions enable row level security;
revoke all on public.payment_submissions from anon, authenticated;

comment on table public.payment_submissions is
  'Private payment-slip metadata. Slip images are stored privately in Google Drive.';

create table public.slip_upload_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index slip_upload_attempts_rate_limit_idx
  on public.slip_upload_attempts (ip_hash, attempted_at desc);

alter table public.slip_upload_attempts enable row level security;
revoke all on public.slip_upload_attempts from anon, authenticated;

create or replace function public.consume_slip_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_attempts integer;
begin
  delete from public.slip_upload_attempts
  where attempted_at < now() - interval '24 hours';

  perform pg_advisory_xact_lock(hashtext(p_ip_hash));

  select count(*)
  into recent_attempts
  from public.slip_upload_attempts
  where ip_hash = p_ip_hash
    and attempted_at >= now() - interval '10 minutes';

  if recent_attempts >= 5 then
    return false;
  end if;

  insert into public.slip_upload_attempts (ip_hash)
  values (p_ip_hash);

  return true;
end;
$$;

revoke all on function public.consume_slip_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_slip_rate_limit(text) to service_role;
