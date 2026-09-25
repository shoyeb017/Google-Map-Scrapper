-- 002_jobs_exports_settings.sql
-- Search jobs, enrichment jobs, provider runs, exports, saved searches, audit logs, settings.

create table if not exists public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  keyword text not null,
  category text,
  location_text text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  radius_meters int,
  country text,
  requested_limit int not null default 100,
  discovery_provider text not null default 'automatic',
  primary_provider text not null default 'google_places',
  fallback_provider text not null default 'browser_discovery',
  enrich_website boolean not null default true,
  discover_social boolean not null default true,
  discover_contacts boolean not null default true,
  multi_location boolean not null default true,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  total_discovered int not null default 0,
  total_saved int not null default 0,
  total_duplicates int not null default 0,
  total_failed int not null default 0,
  enriched_count int not null default 0,
  social_count int not null default 0,
  fallback_used boolean not null default false,
  fallback_reason text,
  primary_provider_used text,
  provider_attempts jsonb not null default '[]',
  provider_failures jsonb not null default '[]',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_job_results (
  id uuid primary key default gen_random_uuid(),
  search_job_id uuid not null references public.search_jobs(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null,
  rank int,
  created_at timestamptz not null default now(),
  unique(search_job_id, business_id)
);

create table if not exists public.scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  search_job_id uuid references public.search_jobs(id) on delete cascade,
  provider text not null,
  status text not null default 'pending',
  attempt int not null default 0,
  max_attempts int not null default 3,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  search_job_id uuid references public.search_jobs(id) on delete set null,
  job_type text not null default 'website',
  status text not null default 'pending',
  attempt int not null default 0,
  max_attempts int not null default 3,
  error_code text,
  error_message text,
  pages_crawled int not null default 0,
  contacts_found int not null default 0,
  socials_found int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_runs (
  id uuid primary key default gen_random_uuid(),
  search_job_id uuid references public.search_jobs(id) on delete cascade,
  provider text not null,
  role text not null default 'primary',
  status text not null default 'pending',
  error_code text,
  error_message text,
  results_count int not null default 0,
  duration_ms int,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  search_job_id uuid references public.search_jobs(id) on delete set null,
  format text not null default 'csv',
  columns text[] not null default '{}',
  filters jsonb not null default '{}',
  selected_ids uuid[] not null default '{}',
  status text not null default 'pending',
  row_count int not null default 0,
  file_url text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  keyword text not null,
  location_text text not null,
  category text,
  radius_meters int,
  requested_limit int not null default 100,
  discovery_provider text not null default 'automatic',
  primary_provider text not null default 'google_places',
  fallback_provider text not null default 'browser_discovery',
  enrich_website boolean not null default true,
  discover_social boolean not null default true,
  discover_contacts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  provider text,
  result text,
  error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value) values
  ('google_places', '{"enabled": true, "isDefault": true}'),
  ('browser_discovery', '{"enabled": true, "browser": "chromium", "timeoutMs": 30000, "concurrency": 2, "maxPages": 20, "maxResults": 100}'),
  ('website_enrichment', '{"enabled": true, "maxPages": 8, "timeoutMs": 15000, "concurrency": 3}'),
  ('export', '{"defaultFormat": "csv", "defaultColumns": []}')
on conflict (key) do nothing;
