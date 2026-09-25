-- 001_initial_schema.sql
-- Business Lead Scraper & Company Intelligence Platform
-- Core normalized schema. No review data by design.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- Profiles (linked to auth.users when auth is enabled)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Businesses: one logical company record (merged across providers)
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  official_name text,
  display_name text,
  alternate_name text,
  description text,
  primary_category text,
  secondary_categories text[] not null default '{}',
  business_types text[] not null default '{}',
  industry text,
  business_status text,
  establishment_status text,
  normalized_name text,
  website text,
  canonical_website text,
  website_domain text,
  primary_phone text,
  primary_email text,
  formatted_address text,
  short_address text,
  street_address text,
  street_number text,
  route text,
  neighborhood text,
  sublocality text,
  locality text,
  city text,
  district text,
  state text,
  division text,
  country text,
  country_code char(2),
  postal_code text,
  plus_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  viewport_northeast_lat numeric(10,7),
  viewport_northeast_lng numeric(10,7),
  viewport_southwest_lat numeric(10,7),
  viewport_southwest_lng numeric(10,7),
  timezone_text text,
  utc_offset_minutes int,
  price_level int,
  opening_hours text[],
  regular_opening_hours jsonb not null default '[]',
  special_hours jsonb not null default '[]',
  open_now boolean,
  accessibility_attributes jsonb not null default '[]',
  business_attributes jsonb not null default '[]',
  maps_url text,
  google_maps_uri text,
  place_id text,
  source_provider text not null default 'unknown',
  source_record_id text,
  source_url text,
  source_place_url text,
  providers text[] not null default '{}',
  enrichment_status text not null default 'pending',
  website_enriched boolean not null default false,
  contacts_found int not null default 0,
  social_accounts_found int not null default 0,
  completeness_score int not null default 0,
  last_crawled_at timestamptz,
  next_crawl_at timestamptz,
  crawl_hash text,
  last_verified_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  data_collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Multiple locations / branches
create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_name text,
  location_type text not null default 'branch',
  address text,
  city text,
  district text,
  country text,
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  place_id text,
  maps_url text,
  phone text,
  opening_hours text[],
  source text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contacts (phones + emails unified with typed contact_type)
create table if not exists public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_type text not null,
  value text not null,
  normalized_value text,
  country_code text,
  category text,
  source text,
  source_url text,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  confidence text not null default 'medium',
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz
);

-- Emails (structured view over contacts for fast filtering)
create table if not exists public.business_emails (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  category text not null default 'general',
  source text,
  source_url text,
  confidence text not null default 'medium',
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz
);

-- Social links
create table if not exists public.business_social_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  platform text not null,
  profile_url text not null,
  username text,
  source text,
  source_url text,
  is_official boolean not null default false,
  confidence text not null default 'medium',
  verification_status text not null default 'unverified',
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  unique(business_id, platform, profile_url)
);

create table if not exists public.business_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text not null,
  is_primary boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.business_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service text not null,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday int not null,
  open_time text,
  close_time text,
  is_closed boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.business_attributes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  attribute_key text not null,
  attribute_value text,
  source text,
  created_at timestamptz not null default now()
);

-- Raw / normalized provider payloads (storage gated by RAW_PAYLOAD_MODE)
create table if not exists public.business_source_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  provider text not null,
  source_identifier text,
  source_url text,
  raw_payload jsonb,
  schema_version text not null default 'v1',
  collected_at timestamptz not null default now()
);

create table if not exists public.business_websites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  official_url text,
  canonical_url text,
  domain text,
  homepage_title text,
  meta_description text,
  company_description text,
  about_url text,
  contact_url text,
  services_url text,
  products_url text,
  solutions_url text,
  team_url text,
  careers_url text,
  pricing_url text,
  support_url text,
  blog_url text,
  faq_url text,
  founding_year text,
  company_size text,
  headquarters text,
  technologies text[] not null default '{}',
  certifications text[] not null default '{}',
  awards text[] not null default '{}',
  partnerships text[] not null default '{}',
  keywords text[] not null default '{}',
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_pages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  url text not null,
  normalized_url text,
  page_type text,
  title text,
  status_code int,
  content_hash text,
  crawled_at timestamptz not null default now()
);

create table if not exists public.website_extractions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  page_url text,
  extraction_type text not null,
  extracted_value text not null,
  confidence text not null default 'medium',
  created_at timestamptz not null default now()
);
