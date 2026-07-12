alter table public.payment_submissions
  add column slip_sha256 text;

alter table public.payment_submissions
  add constraint payment_submissions_slip_sha256_format_check
  check (slip_sha256 is null or slip_sha256 ~ '^[0-9a-f]{64}$');

create unique index payment_submissions_slip_sha256_unique_idx
  on public.payment_submissions (slip_sha256)
  where slip_sha256 is not null;

comment on column public.payment_submissions.slip_sha256 is
  'SHA-256 fingerprint used to reject an exact duplicate slip image.';
