-- 003_indexes_rls.sql
-- Indexes + RLS. Permissive for anon/service in dev; tighten for production with auth.

create index if not exists idx_businesses_name on public.businesses (name);
create index if not exists idx_businesses_normalized_name on public.businesses (normalized_name);
create index if not exists idx_businesses_domain on public.businesses (website_domain);
create index if not exists idx_businesses_city on public.businesses (city);
create index if not exists idx_businesses_district on public.businesses (district);
create index if not exists idx_businesses_country on public.businesses (country);
create index if not exists idx_businesses_lat on public.businesses (latitude);
create index if not exists idx_businesses_lng on public.businesses (longitude);
create index if not exists idx_businesses_provider on public.businesses (source_provider);
create index if not exists idx_businesses_place_id on public.businesses (place_id);
create index if not exists idx_businesses_status on public.businesses (enrichment_status);
create index if not exists idx_businesses_created on public.businesses (created_at desc);
create index if not exists idx_businesses_updated on public.businesses (updated_at desc);
create index if not exists idx_businesses_trgm on public.businesses using gin (name gin_trgm_ops);

create index if not exists idx_locations_business on public.business_locations (business_id);
create index if not exists idx_contacts_business on public.business_contacts (business_id);
create index if not exists idx_contacts_value on public.business_contacts (normalized_value);
create index if not exists idx_emails_business on public.business_emails (business_id);
create index if not exists idx_social_business on public.business_social_links (business_id);
create index if not exists idx_social_platform on public.business_social_links (platform);
create index if not exists idx_search_jobs_status on public.search_jobs (status);
create index if not exists idx_search_jobs_created on public.search_jobs (created_at desc);
create index if not exists idx_job_results_job on public.search_job_results (search_job_id);
create index if not exists idx_job_results_biz on public.search_job_results (business_id);
create index if not exists idx_enrichment_status on public.enrichment_jobs (status);
create index if not exists idx_enrichment_biz on public.enrichment_jobs (business_id);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_locations enable row level security;
alter table public.business_contacts enable row level security;
alter table public.business_emails enable row level security;
alter table public.business_social_links enable row level security;
alter table public.business_categories enable row level security;
alter table public.business_services enable row level security;
alter table public.business_hours enable row level security;
alter table public.business_attributes enable row level security;
alter table public.business_source_records enable row level security;
alter table public.business_websites enable row level security;
alter table public.website_pages enable row level security;
alter table public.website_extractions enable row level security;
alter table public.search_jobs enable row level security;
alter table public.search_job_results enable row level security;
alter table public.scrape_jobs enable row level security;
alter table public.enrichment_jobs enable row level security;
alter table public.provider_runs enable row level security;
alter table public.export_jobs enable row level security;
alter table public.saved_searches enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

-- Dev-friendly policies: service_role bypasses RLS; allow anon read/write so the app
-- works before Supabase Auth is wired up. Harden before public launch.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','businesses','business_locations','business_contacts','business_emails',
    'business_social_links','business_categories','business_services','business_hours',
    'business_attributes','business_source_records','business_websites','website_pages',
    'website_extractions','search_jobs','search_job_results','scrape_jobs','enrichment_jobs',
    'provider_runs','export_jobs','saved_searches','audit_logs','system_settings']
  loop
    execute format('drop policy if exists "dev_all" on public.%I', t);
    execute format('create policy "dev_all" on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;
