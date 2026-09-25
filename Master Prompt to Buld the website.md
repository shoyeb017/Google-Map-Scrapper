# MASTER DEVELOPMENT PROMPT

# BUSINESS LEAD SCRAPER & COMPANY INTELLIGENCE PLATFORM

## Next.js + React + TypeScript + Supabase

## Google Places API + Browser Discovery + Website Enrichment

## No Docker

---

# 1. ROLE

Act as a senior full-stack software architect, backend engineer, database engineer, web automation engineer, data engineer, UI/UX designer, security engineer, and DevOps engineer.

Build a complete, production-oriented business discovery, lead collection, and company enrichment platform.

This must be a real working application, not a mockup, static dashboard, or partially implemented prototype.

The platform should allow a user to search for companies/businesses by:

* Keyword
* Business category
* City
* Area
* Country
* Location
* Search radius where supported
* Maximum number of results

The system must discover businesses, collect comprehensive publicly available business information, enrich the data from the official company website, normalize and deduplicate the results, store everything in Supabase, show the results in a dashboard, and allow export to Excel/CSV.

---

# 2. MOST IMPORTANT REQUIREMENT: TWO DISCOVERY METHODS

The system MUST support both of the following discovery methods.

## METHOD 1: GOOGLE PLACES API

Use the official Google Places API / Places API (New) when configured.

This method should retrieve as much available business information as the selected Places API fields allow.

---

## METHOD 2: BROWSER-BASED DISCOVERY

Use browser automation, such as Playwright, for sources and workflows where automated browser access is permitted.

This provider should be capable of discovering businesses from map/search pages and extracting publicly visible business information.

The browser provider must be independently usable and must not depend on the Google Places API.

---

# 3. THE USER MUST BE ABLE TO CHOOSE THE METHOD

Create a provider selection system.

The UI must contain:

### Discovery Provider

* Google Places API
* Browser Discovery
* Automatic / Fallback

Example:

```text
Discovery Method:
[ Google Places API ▼ ]

Options:
- Google Places API
- Browser Discovery
- Automatic / Fallback
```

The user must be able to explicitly choose either provider.

Do not force the user to use Google Places API.

Do not force the user to use browser automation.

Both must be fully implemented.

---

# 4. AUTOMATIC FALLBACK MODE

Implement a provider orchestration system.

Example:

```text
Automatic / Fallback

Primary Provider:
Google Places API

Fallback Provider:
Browser Discovery
```

or:

```text
Automatic / Fallback

Primary Provider:
Browser Discovery

Fallback Provider:
Google Places API
```

The user should be able to select the primary and fallback providers.

If the primary provider fails, automatically attempt the fallback provider.

Examples of conditions that may trigger fallback:

* API key unavailable
* API credentials invalid
* API quota exhausted
* Rate limit
* Temporary provider failure
* Provider timeout
* Search request failure
* Browser launch failure
* Browser navigation failure
* Source unavailable
* Unexpected page structure
* Provider returns no usable results
* Provider temporarily becomes unavailable

Do not silently fail.

Record:

```text
primary_provider
fallback_provider
provider_attempts
provider_failures
fallback_used
fallback_reason
```

The user must be able to see which provider actually produced each business.

---

# 5. IMPORTANT: PROVIDER INDEPENDENCE

The architecture must keep discovery providers modular.

Create something similar to:

```text
DiscoveryProvider
    |
    ├── GooglePlacesProvider
    |
    └── BrowserDiscoveryProvider
```

Each provider should expose a common interface.

For example:

```typescript
interface DiscoveryProvider {
  searchBusinesses(params: SearchParams): Promise<DiscoveryResult>;
  getBusinessDetails?(params: BusinessDetailsParams): Promise<BusinessDetails>;
  healthCheck?(): Promise<ProviderHealth>;
}
```

Do not tightly couple the rest of the application to either provider.

The following layers should remain independent:

```text
UI
 |
Search API
 |
Provider Orchestrator
 |
Discovery Provider
 |
Normalization
 |
Database
 |
Enrichment
 |
Export
```

---

# 6. SUPABASE IS THE PRIMARY DATABASE

Supabase will be provided later.

I will provide the Supabase project URL, anon key, service-role key, and other required configuration when ready.

Do NOT invent credentials.

Do NOT hard-code credentials.

Do NOT assume the Supabase project exists locally.

Build the application so it can operate while credentials are not yet supplied, but prepare all required Supabase integration.

Once I provide the Supabase credentials, the application must be connected to the actual Supabase project.

---

# 7. SUPABASE DATABASE MUST ACTUALLY BE CREATED AND UPDATED

This is a critical requirement.

Do not only create TypeScript interfaces or pretend that a schema exists.

Create a real PostgreSQL schema using Supabase migrations.

All database changes must be represented using migration files.

Use:

```text
supabase/
  migrations/
```

Every schema change must have a migration.

Examples:

```text
001_initial_schema.sql
002_add_business_locations.sql
003_add_social_links.sql
004_add_scraping_jobs.sql
...
```

The application must support continuous database evolution.

Whenever the application requires a new table, column, index, constraint, function, trigger, enum, or RLS policy:

1. Create a migration.
2. Apply the migration to the configured Supabase project.
3. Verify the resulting schema.
4. Update generated TypeScript types.
5. Test the application against the updated schema.

Never make undocumented production schema changes.

---

# 8. WHEN SUPABASE CREDENTIALS ARE PROVIDED

Once credentials are available:

1. Connect to the Supabase project.
2. Verify connectivity.
3. Verify project configuration.
4. Apply all pending migrations.
5. Create missing tables.
6. Create relationships.
7. Create indexes.
8. Create RLS policies.
9. Create required database functions.
10. Create required storage buckets.
11. Verify database access.
12. Verify insert/update/delete operations.
13. Verify authentication.
14. Verify background-job persistence.
15. Verify realtime updates where used.
16. Generate/update database TypeScript types.
17. Run integration tests.

Never report that Supabase has been updated unless the remote database was actually updated and verified.

---

# 9. NO DOCKER

Do not use:

* Docker
* Docker Compose
* dockerized PostgreSQL
* dockerized workers
* dockerized local Supabase

The system must be runnable using normal Node.js development tooling.

Use:

* Node.js
* npm
* Next.js
* Supabase Cloud
* Playwright
* Managed worker hosting

The development workflow must work on Windows.

---

# 10. RECOMMENDED ARCHITECTURE

Use:

```text
Frontend
Next.js + React + TypeScript
        |
        v
Application / API Layer
Next.js Route Handlers
        |
        v
Provider Orchestrator
        |
        +-----------------------+
        |                       |
        v                       v
Google Places API      Browser Discovery
        |                       |
        +-----------+-----------+
                    |
                    v
              Normalization
                    |
                    v
               Supabase
                    |
          +---------+---------+
          |                   |
          v                   v
 Website Enrichment     Background Jobs
          |                   |
          +---------+---------+
                    |
                    v
               Final Dataset
                    |
          +---------+---------+
          |                   |
          v                   v
       Dashboard          Export Engine
                            |
                       Excel / CSV
```

---

# 11. BUSINESS DISCOVERY WORKFLOW

Example:

```text
Keyword:
Digital Marketing Agency

Location:
Dhaka, Bangladesh

Maximum Results:
500

Discovery:
Automatic / Fallback

Primary:
Google Places API

Fallback:
Browser Discovery

Website Enrichment:
Enabled

Social Discovery:
Enabled

Contact Discovery:
Enabled
```

The system then:

1. Creates a search job.
2. Selects the configured provider.
3. Searches for businesses.
4. Collects all available business fields.
5. Collects detailed information when available.
6. Normalizes the result.
7. Detects duplicates.
8. Stores the business.
9. Finds the official website.
10. Queues website enrichment.
11. Crawls permitted website pages.
12. Finds additional contacts.
13. Finds social accounts.
14. Finds additional company information.
15. Updates the Supabase record.
16. Marks the record as completed.
17. Shows progress in the dashboard.

---

# 12. COLLECT AS MUCH BUSINESS INFORMATION AS POSSIBLE

This is one of the most important requirements.

The system should collect **as much publicly available and permitted business information as the selected source provides**.

Do not limit the dataset to:

* Name
* Phone
* Email
* Website

The database must be designed for comprehensive business intelligence.

However:

## DO NOT COLLECT REVIEWS

Reviews are NOT required.

Do not collect or store:

* Review text
* Reviewer names
* Reviewer profile information
* Individual review ratings
* Review content
* Review timestamps
* Review responses
* Review media

Do not request unnecessary review-related API fields.

Review data should not appear in the dashboard or exports.

---

# 13. BUSINESS IDENTITY INFORMATION

Create fields for:

* Business name
* Official name
* Display name
* Alternate name
* Business description
* Primary category
* Secondary categories
* Business types
* Industry
* Business status
* Business establishment status where available
* Source provider
* Source record ID
* Source URL
* Source place URL
* Maps URL
* Data collection timestamp
* Last updated timestamp
* First discovered timestamp

Do not invent data.

If a field is unavailable, store NULL.

---

# 14. GOOGLE MAP / PLACE INFORMATION

Capture as much map/place information as is available from the selected source and permitted to store.

Include fields such as:

* Google Place ID when available and permitted
* Place name
* Maps URL
* Google Maps URI when available
* Business website
* Primary phone
* National phone
* International phone
* Address
* Formatted address
* Short address
* Street address
* Street number
* Route/street
* Neighborhood
* Sublocality
* Locality
* City
* District
* State
* Division
* Country
* Country code
* Postal code
* Plus Code when available
* Latitude
* Longitude
* Geographic coordinates
* Viewport/bounding coordinates when available
* Time zone / UTC offset when available
* Business status
* Primary business type
* Additional types/categories
* Price level where available
* Opening hours
* Regular opening hours
* Special hours where available
* Current open/closed status where available
* Accessibility attributes where available
* Other supported business attributes

Do not rely on undocumented/private fields.

Only collect fields that are available from the source and permitted to be collected.

---

# 15. MULTIPLE LOCATIONS / BRANCHES

Do not assume that one company always has one location.

The database must support:

```text
One Company
   |
   +-- Location 1
   +-- Location 2
   +-- Location 3
   +-- ...
```

Create a separate `business_locations` table.

Each location can have:

* Address
* Latitude
* Longitude
* Place ID
* Maps URL
* Phone
* Opening hours
* Postal code
* City
* District
* Country
* Location type
* Branch name
* Source
* Source URL

This allows the same company to have multiple branches.

---

# 16. BUSINESS PHONE NUMBERS

Store multiple phone numbers.

Do not overwrite one phone with another.

Create a contact table.

Example:

```text
business_contacts
```

Fields:

* id
* business_id
* contact_type
* value
* normalized_value
* country_code
* source
* source_url
* is_primary
* is_verified
* discovered_at
* last_verified_at

Contact types:

* phone
* mobile
* landline
* WhatsApp
* email
* support
* sales
* general
* careers
* other

Use `libphonenumber-js` for phone normalization where possible.

---

# 17. EMAIL COLLECTION

Collect publicly available company email addresses from:

* Business source
* Official website
* Contact page
* About page
* Footer
* Team page
* Careers page
* Support page
* Other clearly public company pages

Possible categories:

* General
* Sales
* Support
* HR
* Careers
* Information
* Marketing
* Customer service
* Other

Do not guess email addresses.

For example, do NOT automatically invent:

```text
info@company.com
sales@company.com
```

unless the address is actually discovered.

Record the exact page where the email was found.

---

# 18. WEBSITE INFORMATION

Once an official website is identified, create an enrichment job.

Collect:

* Official URL
* Canonical URL
* Domain
* Homepage title
* Meta description
* Company description
* About page
* Contact page
* Services page
* Products page
* Solutions page
* Team page
* Careers page
* Pricing page
* Support page
* Blog/news page
* FAQ page

Also extract useful public company information when available.

Examples:

* Company founding year
* Company size
* Services
* Products
* Industries served
* Locations
* Headquarters
* Contact details
* Business description
* Keywords
* Technologies
* Certifications
* Awards
* Partnerships
* Branches
* Job/career information

Only store data that is actually found.

---

# 19. WEBSITE CRAWLER

Use a controlled crawler.

Use:

* Playwright when JavaScript rendering is required.
* Cheerio when static HTML parsing is sufficient.
* Fetch/Axios for normal HTTP requests.

The crawler must support:

* robots.txt awareness where applicable
* request timeout
* retry
* concurrency limits
* maximum pages per domain
* maximum crawl depth
* content-size limits
* duplicate URL detection
* canonical URL handling
* URL normalization
* same-domain restriction by default
* failed-page logging

Do not blindly crawl unlimited pages.

Default crawl strategy:

```text
Homepage
   |
   +-- About
   +-- Contact
   +-- Services
   +-- Products
   +-- Team
   +-- Careers
   +-- Support
```

Prioritize pages that are likely to contain company/contact information.

---

# 20. SOCIAL MEDIA DISCOVERY

Collect official company social media accounts whenever publicly available.

Supported platforms must include:

* Facebook
* LinkedIn
* Instagram
* YouTube
* X / Twitter
* TikTok
* Pinterest
* WhatsApp
* Telegram
* Threads
* Other discovered platforms

Create:

```text
business_social_links
```

Fields:

* id
* business_id
* platform
* profile_url
* username/handle where available
* source
* source_url
* is_official
* confidence
* verification_status
* discovered_at
* last_verified_at

Priority:

### Highest confidence

Social links found directly on the official company website.

### High confidence

Official links supplied by a permitted business/map provider.

### Medium confidence

Clearly linked official social account discovered through publicly accessible company content.

Do not incorrectly assign unrelated social accounts to a company.

---

# 21. SOCIAL LINK DETECTION

Create a platform detector.

For example:

```text
facebook.com/*
linkedin.com/company/*
linkedin.com/in/*
instagram.com/*
youtube.com/*
x.com/*
twitter.com/*
tiktok.com/*
pinterest.com/*
wa.me/*
api.whatsapp.com/*
t.me/*
threads.net/*
```

Normalize URLs.

Remove tracking parameters where safe.

Deduplicate profiles.

Preserve the original source URL for traceability.

---

# 22. BUSINESS MAP LOCATION

The UI must show map information.

For every business with coordinates, show:

* Latitude
* Longitude
* Address
* City
* Country
* Maps URL
* Embedded map/location visualization where supported

The user should be able to:

* Open Google Maps
* Copy coordinates
* Copy address
* View business location
* Filter businesses by location

Store coordinates as numeric database fields.

Recommended:

```sql
latitude numeric
longitude numeric
```

Do not store coordinates as strings only.

---

# 23. SOURCE PROVENANCE

Every important piece of collected information should have provenance.

The system should be able to answer:

> Where did this information come from?

Possible sources:

```text
google_places_api
browser_discovery
company_website
company_contact_page
company_about_page
company_social_page
manual
```

Store:

* source_type
* source_url
* source_provider
* collection_method
* discovered_at

Where practical, create a generic source/provenance table.

---

# 24. RAW SOURCE DATA

Create support for retaining normalized provider data and, where legally/contractually permitted, the relevant raw provider response for debugging/auditing.

Example:

```text
business_source_records
```

Fields:

* id
* business_id
* provider
* source_identifier
* source_url
* raw_payload
* collected_at
* schema_version

However, respect provider terms and storage restrictions.

Do not blindly persist raw third-party API responses if the provider's current terms prohibit that storage.

The system architecture must allow raw responses to be disabled or selectively stored.

---

# 25. DATABASE DESIGN

Create a normalized schema.

Suggested core tables:

```text
profiles
businesses
business_locations
business_contacts
business_emails
business_social_links
business_categories
business_services
business_hours
business_attributes
business_source_records
business_websites
website_pages
website_extractions
search_jobs
search_job_results
scrape_jobs
enrichment_jobs
provider_runs
export_jobs
saved_searches
audit_logs
system_settings
```

You may modify the final schema if a better normalized architecture is appropriate.

Do not duplicate large amounts of data unnecessarily.

---

# 26. SEARCH JOBS

Create a `search_jobs` table.

Store:

* id
* user_id
* keyword
* category
* location_text
* latitude
* longitude
* radius
* country
* requested_limit
* discovery_provider
* fallback_provider
* status
* started_at
* completed_at
* total_discovered
* total_saved
* total_duplicates
* total_failed
* fallback_used
* error_message
* created_at

Statuses:

```text
pending
running
completed
partial
failed
cancelled
```

---

# 27. BACKGROUND JOB SYSTEM

Do not perform long scraping tasks inside a normal request/response cycle.

Use background jobs.

Examples:

```text
Search Job
      |
      +-- Discovery
      |
      +-- Save business
      |
      +-- Website Enrichment
      |
      +-- Social Discovery
      |
      +-- Contact Extraction
      |
      +-- Deduplication
      |
      +-- Finalize
```

Use Supabase-compatible queue/job architecture or another managed queue that works without Docker.

The UI must show job progress.

---

# 28. JOB RETRIES

Jobs should retry automatically where appropriate.

Example:

```text
attempt 1
attempt 2
attempt 3
```

Use exponential backoff.

Do not endlessly retry permanent failures.

Differentiate:

```text
retryable error
permanent error
provider unavailable
invalid input
rate limited
blocked
timeout
parsing error
```

---

# 29. DEDUPLICATION

The system must aggressively detect duplicate businesses.

Potential matching keys:

1. Provider place ID where available.
2. Canonical website domain.
3. Normalized phone number.
4. Exact normalized address.
5. Business name + address.
6. Business name + coordinates.
7. Fuzzy name similarity + geographic proximity.

Do not rely on business name alone.

The same company discovered through Google Places API and browser discovery should result in one logical business record whenever confidently matched.

Keep source provenance from both providers.

---

# 30. PROVIDER MERGING

Example:

Google Places API finds:

```text
ABC Technologies
Phone: +880...
Website: https://abc.com
Coordinates: ...
```

Browser discovery finds:

```text
ABC Technologies
LinkedIn: ...
Facebook: ...
Additional phone: ...
```

The system should merge them into one business profile.

The final profile can contain:

```text
Business identity
+
Map information
+
API information
+
Browser information
+
Website information
+
Social information
+
Contact information
```

Do not overwrite useful information with NULL values.

Use intelligent merge rules.

---

# 31. DATA NORMALIZATION

Normalize:

* Business names
* URLs
* Domains
* Phone numbers
* Emails
* Addresses
* Social links
* Country codes
* Coordinates

Examples:

```text
HTTP -> HTTPS where appropriate
Remove tracking query parameters
Normalize phone numbers
Lowercase domains
Trim whitespace
Normalize Unicode
Normalize social platform names
```

Preserve the original value where necessary for provenance.

---

# 32. DASHBOARD

Create a professional dashboard.

Main sections:

```text
Dashboard
Search
Businesses
Business Details
Jobs
Enrichment
Exports
Saved Searches
Settings
Providers
Logs
```

---

# 33. SEARCH PAGE

Create a powerful search interface.

Fields:

### Search keyword

Example:

```text
Software Company
```

### Location

Example:

```text
Dhaka, Bangladesh
```

### Radius

Example:

```text
10 km
```

### Result limit

Example:

```text
500
```

### Discovery Method

```text
Google Places API
Browser Discovery
Automatic / Fallback
```

### Primary Provider

### Fallback Provider

### Website Enrichment

```text
ON / OFF
```

### Social Discovery

```text
ON / OFF
```

### Contact Enrichment

```text
ON / OFF
```

### Multi-location discovery

```text
ON / OFF
```

---

# 34. BUSINESS TABLE

Create a powerful data table.

Columns should include:

* Checkbox
* Business name
* Category
* Phone
* Email
* Website
* Facebook
* LinkedIn
* Instagram
* YouTube
* X
* WhatsApp
* Address
* City
* District
* Country
* Latitude
* Longitude
* Maps URL
* Provider
* Website enriched
* Contacts found
* Social accounts found
* Status
* Created date
* Updated date

Allow the user to customize visible columns.

---

# 35. BUSINESS DETAILS PAGE

Clicking a business should open a detailed profile.

Sections:

### Overview

* Business name
* Description
* Category
* Status
* Website

### Location

* Map
* Address
* Latitude
* Longitude
* Maps URL
* Branches

### Contact

* Phone numbers
* Emails
* WhatsApp
* Contact page

### Website

* Official website
* About
* Services
* Products
* Careers
* Contact
* Other discovered pages

### Social Media

* Facebook
* LinkedIn
* Instagram
* YouTube
* X
* TikTok
* Pinterest
* WhatsApp
* Telegram
* Threads
* Others

### Business Information

* Categories
* Services
* Industries
* Business attributes
* Hours
* Other collected company information

### Sources

Show exactly where the information came from.

### Enrichment status

Show:

```text
Discovery
Website crawl
Contact extraction
Social discovery
Deduplication
Last verified
```

---

# 36. MAP VIEW

Create a map view of collected businesses.

Requirements:

* Marker for each business.
* Latitude/longitude.
* Click marker to open business summary.
* Open full profile.
* Open external Maps link.
* Cluster markers when many businesses exist.
* Filter by category.
* Filter by search.
* Filter by status.

The map must not expose review information.

---

# 37. FILTERING

Support filters for:

* Business name
* Category
* City
* District
* Country
* Phone availability
* Email availability
* Website availability
* Facebook
* LinkedIn
* Instagram
* YouTube
* WhatsApp
* Other social platforms
* Provider
* Search job
* Website enrichment status
* Location
* Coordinates
* Business status
* Data freshness

Example:

```text
Show companies in Dhaka
with:
Website = Yes
Email = Yes
LinkedIn = Yes
```

---

# 38. BULK OPERATIONS

Allow selecting multiple businesses.

Actions:

* Enrich selected
* Re-enrich selected
* Crawl websites
* Discover social accounts
* Discover contacts
* Export selected
* Delete selected
* Mark as verified
* Mark as reviewed internally

Use confirmation dialogs for destructive operations.

---

# 39. EXPORT SYSTEM

Support:

## CSV

Export:

```text
.csv
```

## Excel

Export:

```text
.xlsx
```

Use ExcelJS.

Exports should support:

* All businesses
* Filtered businesses
* Selected businesses
* Search-job results

Allow column selection.

Possible export columns:

```text
Business Name
Category
Subcategories
Description
Phone
Additional Phones
Email
Additional Emails
Website
About URL
Contact URL
Facebook
LinkedIn
Instagram
YouTube
X
TikTok
WhatsApp
Telegram
Address
Street
Area
City
District
State
Country
Postal Code
Latitude
Longitude
Maps URL
Place ID
Opening Hours
Business Status
Provider
Source URL
Last Verified
```

Do not include review data.

---

# 40. EXPORT DATA FROM BOTH DISCOVERY METHODS

If a business was discovered through:

```text
Google Places API
+
Browser Discovery
+
Website Enrichment
```

the export should contain the merged result.

Also allow an optional source column indicating where each business was discovered.

---

# 41. SETTINGS

Create a provider settings page.

Sections:

## Google Places

```text
API Key
Enabled
Default provider
Quota/usage status if available
```

## Browser Discovery

```text
Enabled
Browser type
Timeout
Concurrency
Maximum pages
Maximum results
```

## Website Enrichment

```text
Enabled
Maximum pages per website
Timeout
Concurrency
```

## Export

```text
Default file format
Default columns
```

Never expose secret keys to the client browser unnecessarily.

Keep sensitive values server-side.

---

# 42. ENVIRONMENT VARIABLES

Prepare:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_MAPS_API_KEY=

BROWSER_DISCOVERY_ENABLED=true

WEBSITE_ENRICHMENT_ENABLED=true

PLAYWRIGHT_BROWSER=
```

Add any additional variables required by the final architecture.

Never commit `.env`.

Create:

```text
.env.example
```

with placeholder values.

---

# 43. SECURITY

Implement:

* Authentication
* Authorization
* Supabase RLS
* Secure API endpoints
* Server-only service credentials
* Input validation
* Zod schemas
* Rate limiting
* Request size limits
* Job limits
* URL validation
* SSRF protections
* Safe redirect handling
* Domain restrictions for website crawling
* Secure secret management
* Audit logs

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
```

or other secrets to browser-side JavaScript.

---

# 44. WEBSITE SECURITY / SSRF PROTECTION

Because users can cause the system to access external websites, protect against SSRF.

Do not allow arbitrary requests to:

```text
localhost
127.0.0.1
0.0.0.0
private IP ranges
link-local addresses
internal cloud metadata endpoints
internal network services
```

Resolve and validate hostnames before crawling.

Prevent redirects into private/internal networks.

---

# 45. BROWSER AUTOMATION SAFETY

Browser discovery must be implemented as a legitimate automation system.

Do NOT implement:

* CAPTCHA bypass
* anti-bot bypass
* authentication bypass
* stolen sessions
* credential theft
* stealth mechanisms designed specifically to defeat access controls
* unauthorized scraping of restricted/private information

Respect:

* provider terms
* robots.txt where relevant
* rate limits
* access controls
* publicly visible information boundaries

If a browser provider cannot access a source, record the failure and allow the configured fallback provider to run.

---

# 46. GOOGLE API FAILURE HANDLING

Examples:

```text
INVALID_API_KEY
QUOTA_EXCEEDED
RATE_LIMIT
REQUEST_DENIED
NETWORK_ERROR
TIMEOUT
UNKNOWN_ERROR
```

Map provider errors into normalized internal errors.

Example:

```typescript
type ProviderErrorCode =
  | "AUTHENTICATION"
  | "QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "ACCESS_DENIED"
  | "NETWORK"
  | "PARSING"
  | "UNKNOWN";
```

Use those to decide whether fallback should occur.

---

# 47. BROWSER FAILURE HANDLING

Examples:

```text
BrowserLaunchFailed
PageLoadFailed
NavigationTimeout
SelectorNotFound
SourceBlocked
UnexpectedPageStructure
ParsingError
```

If the browser provider fails and fallback is enabled:

```text
Browser Provider
       |
       X
       |
       v
Google Places API
```

Likewise, if API fails first:

```text
Google Places API
       |
       X
       |
       v
Browser Provider
```

---

# 48. PROVIDER HEALTH CHECK

Create provider health checks.

The UI should show:

```text
Google Places API
● Healthy

Browser Discovery
● Healthy

Website Enrichment
● Enabled
```

Possible states:

* Healthy
* Degraded
* Unavailable
* Not configured

Do not expose sensitive credentials.

---

# 49. AUDIT LOGGING

Create an audit system.

Record:

* User
* Action
* Entity
* Entity ID
* Timestamp
* Provider
* Result
* Error
* Metadata

Examples:

```text
SEARCH_STARTED
SEARCH_COMPLETED
SEARCH_FAILED
FALLBACK_TRIGGERED
BUSINESS_CREATED
BUSINESS_UPDATED
WEBSITE_CRAWL_STARTED
WEBSITE_CRAWL_COMPLETED
SOCIAL_DISCOVERY_COMPLETED
EXPORT_CREATED
```

---

# 50. OBSERVABILITY

Create internal logs for:

* Search jobs
* Provider requests
* Provider failures
* Browser sessions
* Website crawls
* Parsing failures
* Database failures
* Export failures
* Queue failures

Use structured logs where practical.

Do not log API secrets.

Do not log unnecessary personal data.

---

# 51. COST CONTROL

The architecture should control API and crawling costs.

Implement:

* Result limits
* Request throttling
* Caching
* Deduplication
* Crawl limits
* Retry limits
* Provider selection
* User-configurable maximum results
* Search-level quotas where appropriate

Do not repeatedly crawl the same website unnecessarily.

Use:

```text
last_crawled_at
next_crawl_at
crawl_hash
```

where appropriate.

---

# 52. WEBSITE RE-ENRICHMENT

Allow businesses to be enriched again later.

For example:

```text
Last enriched:
2026-09-20

Re-enrich
```

The system should avoid unnecessary crawling if the website was recently processed.

Allow manual forced refresh.

---

# 53. SEARCH HISTORY

Store previous searches.

Example:

```text
Software Companies
Dhaka
500 results
Google Places API
Completed
```

The user can:

* Open
* Continue
* Re-run
* Export
* Delete

---

# 54. SAVED SEARCHES

Allow users to save:

```text
Keyword
Location
Provider
Result limit
Enrichment settings
```

Example:

```text
"Dhaka IT Companies"
```

---

# 55. PERFORMANCE

Design the application to handle thousands of businesses.

Use:

* Pagination
* Server-side filtering
* Database indexes
* Background jobs
* Chunked exports
* Lazy loading
* Virtualized tables where appropriate
* Batch database writes
* Concurrency controls

Do not load thousands of complete business objects into the browser unnecessarily.

---

# 56. DATABASE INDEXING

Add appropriate indexes for:

* business name
* normalized name
* website domain
* phone
* email
* city
* district
* country
* latitude
* longitude
* provider
* source ID
* search job ID
* status
* created_at
* updated_at

Use unique constraints where appropriate.

---

# 57. DATA QUALITY

Build a data-quality layer.

Example:

```text
Business completeness:
78%
```

Possible scoring factors:

* Business name
* Category
* Phone
* Email
* Website
* Address
* Coordinates
* Social links
* Description
* Contact information

The score should describe completeness, not business quality.

---

# 58. DATA CONFIDENCE

For extracted information, support confidence values where useful.

For example:

```text
Official LinkedIn
Confidence: High
Source: company website
```

or:

```text
Email
Confidence: Medium
Source: contact page
```

Do not present guesses as facts.

---

# 59. USER INTERFACE DESIGN

Create a professional SaaS dashboard.

Style:

* Modern
* Clean
* Data-oriented
* Professional
* Responsive
* Desktop-first
* Mobile-compatible
* Fast

Use:

* shadcn/ui
* Tailwind
* Lucide icons
* Tables
* Cards
* Tabs
* Drawers
* Dialogs
* Toasts
* Progress indicators
* Skeleton loaders
* Empty states

Avoid unnecessary visual clutter.

---

# 60. MAIN DASHBOARD

Show:

```text
Total Businesses
New Businesses
Businesses with Website
Businesses with Email
Businesses with Phone
Businesses with LinkedIn
Businesses with Facebook
Businesses with Instagram
Businesses with WhatsApp
Enrichment Pending
Enrichment Completed
Failed Jobs
```

Also show:

```text
Recent Searches
Recent Enrichment Jobs
Recent Exports
Provider Health
```

---

# 61. LIVE JOB PROGRESS

When a search is running, show:

```text
Searching...

Provider:
Google Places API

Discovered:
347

Saved:
331

Duplicates:
16

Website enrichment:
120 / 331

Social discovery:
98 / 331

Errors:
4

Fallback:
Not used
```

Update the UI using polling or Supabase Realtime where appropriate.

---

# 62. ERROR RECOVERY UI

Do not only show:

```text
Error
```

Show useful information:

```text
Google Places API failed because the API quota was exceeded.

Fallback provider:
Browser Discovery

Fallback status:
Running
```

or:

```text
Browser Discovery failed because the source could not be accessed.

Fallback:
Google Places API

Status:
Completed
```

---

# 63. TESTING

Implement tests for:

### Unit tests

* URL normalization
* Phone normalization
* Email extraction
* Social platform detection
* Deduplication
* Provider selection
* Fallback logic
* Data normalization

### Integration tests

* Supabase database
* Search jobs
* Provider orchestration
* Business insertion
* Website enrichment
* Social discovery
* Export generation

### End-to-end tests

Test the primary user workflow:

```text
Login
→ Search
→ Discover
→ Save
→ Enrich
→ View business
→ Filter
→ Export
```

---

# 64. PROVIDER FALLBACK TESTS

Create explicit automated tests.

Scenario 1:

```text
Google Places API = success
Browser = not called
```

Scenario 2:

```text
Google Places API = failure
Browser = success
Fallback = triggered
```

Scenario 3:

```text
Browser = success
Google Places API = not called
```

Scenario 4:

```text
Browser = failure
Google Places API = success
Fallback = triggered
```

Scenario 5:

```text
Both providers fail
Job = partial/failed
Reason = recorded
```

---

# 65. MOCK MODE

Before real API credentials are supplied, create a mock provider.

Example:

```text
MockDiscoveryProvider
```

This should allow complete development and UI testing without external credentials.

However:

Do not confuse mock results with real provider results.

The UI should clearly show:

```text
Provider: Mock
```

---

# 66. DEVELOPMENT PHASES

Build in phases.

## PHASE 1

Project setup:

* Next.js
* TypeScript
* Tailwind
* shadcn/ui
* Supabase client
* Environment configuration

## PHASE 2

Database:

* Supabase migrations
* Tables
* Relationships
* Indexes
* RLS
* Types

## PHASE 3

Authentication.

## PHASE 4

Provider architecture.

Implement:

```text
GooglePlacesProvider
BrowserDiscoveryProvider
MockDiscoveryProvider
ProviderOrchestrator
```

## PHASE 5

Business discovery.

## PHASE 6

Business normalization and deduplication.

## PHASE 7

Website enrichment.

## PHASE 8

Contact extraction.

## PHASE 9

Social media discovery.

## PHASE 10

Background jobs.

## PHASE 11

Dashboard.

## PHASE 12

Map interface.

## PHASE 13

Exports.

## PHASE 14

Testing.

## PHASE 15

Production hardening.

---

# 67. CODE QUALITY REQUIREMENTS

Use:

* TypeScript strict mode
* Clear interfaces
* Reusable components
* Modular services
* Small functions
* Error handling
* Validation
* Typed database access
* No unnecessary `any`
* Environment validation
* Secure server/client separation

Avoid:

* Giant monolithic files
* Hard-coded secrets
* Hard-coded business data
* Duplicate logic
* Provider-specific logic spread throughout the UI

---

# 68. PROJECT STRUCTURE

A reasonable starting structure:

```text
src/
  app/
    dashboard/
    search/
    businesses/
    businesses/[id]/
    jobs/
    exports/
    settings/
    api/

  components/
    ui/
    dashboard/
    businesses/
    search/
    jobs/
    map/
    exports/

  lib/
    supabase/
    providers/
      google-places/
      browser-discovery/
      mock/
    enrichment/
    crawler/
    social/
    contacts/
    normalization/
    deduplication/
    exports/
    jobs/
    security/

  types/
  schemas/

supabase/
  migrations/

workers/
  discovery-worker/
  enrichment-worker/

tests/
```

Adapt the structure when necessary, but preserve clear separation of concerns.

---

# 69. DATABASE MIGRATION WORKFLOW

The development process must support:

```text
Code Change
    ↓
Database Change Required?
    ↓
Create Migration
    ↓
Apply to Supabase
    ↓
Generate Types
    ↓
Run Tests
    ↓
Commit
```

Do not leave schema changes only in code.

---

# 70. README DOCUMENTATION

Create a comprehensive README containing:

## Setup

```text
npm install
npm run dev
```

## Environment variables

Explain every variable.

## Supabase setup

Explain:

* Create project
* Configure credentials
* Run migrations
* Generate types
* Configure RLS

## Google Places configuration

Explain where the API key is configured.

## Browser discovery

Explain browser requirements.

## Website enrichment

Explain crawler configuration.

## Worker

Explain how background jobs run.

## Deployment

Explain:

```text
Vercel
+
Supabase
+
Managed Node worker
```

---

# 71. IMPORTANT DATA-SOURCE RULE

Do not claim that a field exists in every provider.

The architecture must understand that different sources provide different data.

Example:

```text
Google Places API
    → structured place data

Browser Discovery
    → publicly visible source information

Company Website
    → additional contacts, descriptions, social links
```

The final business profile should combine information from all valid sources.

---

# 72. SOURCE PRIORITY

When the same field appears from different sources, use sensible precedence.

Example:

```text
Official company website
        |
Trusted structured provider
        |
Browser-discovered source
        |
Other public source
```

But do not blindly overwrite existing data.

Store source provenance for important fields.

---

# 73. NO REVIEWS

This is explicit and mandatory.

The system must NOT:

* Collect reviews
* Store reviews
* Display reviews
* Export reviews
* Crawl reviewer information
* Request unnecessary review-related data

The application is focused on:

```text
Business identity
Contact information
Location
Map information
Website
Social media
Business information
Company enrichment
```

---

# 74. EXAMPLE FINAL DATASET

A final business record may look conceptually like:

```text
Business:
ABC Technologies Ltd.

Category:
Software Company

Description:
...

Phone:
+880...

Additional Phones:
...

Email:
info@abc.com

Additional Emails:
sales@abc.com
careers@abc.com

Website:
https://abc.com

Facebook:
https://facebook.com/abc

LinkedIn:
https://linkedin.com/company/abc

Instagram:
https://instagram.com/abc

YouTube:
https://youtube.com/@abc

X:
https://x.com/abc

WhatsApp:
https://wa.me/880...

Address:
...

City:
Dhaka

District:
Dhaka

Country:
Bangladesh

Postal Code:
...

Latitude:
23.xxxxxx

Longitude:
90.xxxxxx

Maps URL:
...

Place ID:
...

Business Status:
...

Opening Hours:
...

Services:
...

Industries:
...

Branches:
...

Sources:
Google Places API
Browser Discovery
Company Website

Website Enriched:
Yes

Last Verified:
...
```

Again, only populate fields actually discovered.

---

# 75. FINAL REQUIREMENT

The application must ultimately provide this workflow:

```text
USER
  |
  v
Search Company / Keyword
  |
  v
Enter Location
  |
  v
Choose Discovery Provider
  |
  +------------------------------+
  |                              |
  v                              v
Google Places API        Browser Discovery
  |                              |
  +--------------+---------------+
                 |
                 v
       Automatic Fallback
                 |
                 v
         Business Discovery
                 |
                 v
       Comprehensive Data
                 |
       +---------+---------+
       |         |         |
       v         v         v
     Map     Contacts    Website
       |         |         |
       +---------+---------+
                 |
                 v
          Social Discovery
                 |
                 v
          Company Enrichment
                 |
                 v
            Deduplication
                 |
                 v
             Supabase
                 |
        +--------+--------+
        |                 |
        v                 v
    Dashboard         Excel / CSV
```

The system must allow:

```text
Google Places API only
```

or:

```text
Browser Discovery only
```

or:

```text
Automatic:
Provider A → Provider B fallback
```

All three modes must work.

---

# 76. FIRST IMPLEMENTATION TASK

Start by creating the project architecture and database design.

Before building the UI in depth:

1. Design the complete Supabase schema.
2. Create migration files.
3. Design provider interfaces.
4. Implement MockDiscoveryProvider.
5. Implement GooglePlacesProvider.
6. Implement BrowserDiscoveryProvider.
7. Implement ProviderOrchestrator.
8. Implement normalized business models.
9. Implement deduplication.
10. Implement job architecture.
11. Then build the UI around the real backend.

Do not build a beautiful frontend first and leave the actual scraping/database system for later.

The backend and database architecture are the foundation.

---

# 77. SUPABASE IS NOT OPTIONAL IN THE FINAL SYSTEM

Once I provide the Supabase credentials:

* Connect to the actual Supabase project.
* Create the tables.
* Apply migrations.
* Update the database as development continues.
* Test real inserts.
* Test updates.
* Test queries.
* Test relationships.
* Test RLS.
* Test job persistence.
* Test exports.
* Keep the schema synchronized with the codebase.

The final application should use Supabase as the persistent source of truth.

---

# 78. FINAL OUTPUT EXPECTATION

At the end of the implementation, provide:

1. Complete source code.
2. Complete Supabase migrations.
3. Database schema documentation.
4. Environment variable documentation.
5. Provider configuration documentation.
6. Worker setup.
7. Testing instructions.
8. Deployment instructions.
9. README.
10. Example `.env.example`.
11. Mock provider for development.
12. Real Google Places provider.
13. Real browser discovery provider.
14. Website enrichment system.
15. Social discovery system.
16. Contact extraction system.
17. Deduplication system.
18. Search history.
19. Background jobs.
20. Dashboard.
21. Map view.
22. Excel export.
23. CSV export.
24. Logging and audit system.

The final system must be genuinely functional and modular.

Do not replace a requested feature with a placeholder unless absolutely necessary.

When an external credential or service is unavailable, implement the integration boundary and a working mock/test path instead of pretending that the real integration works.

---

# 79. IMPORTANT IMPLEMENTATION PRINCIPLE

Think of the project as:

```text
DISCOVERY
     +
ENRICHMENT
     +
NORMALIZATION
     +
DEDUPLICATION
     +
STORAGE
     +
ANALYTICS
     +
EXPORT
```

The goal is not simply to "scrape Google Maps."

The goal is to build a reusable **Business Lead Discovery and Company Intelligence Platform** where multiple discovery providers can feed one normalized company database.

The same business should be able to accumulate information from:

```text
Google Places API
        +
Browser Discovery
        +
Official Company Website
        +
Public Social Links
        +
Multiple Business Locations
        +
Additional Contact Information
```

while maintaining clear source provenance and avoiding reviews/review-related information.

Build the system so that another discovery provider can be added later without redesigning the application.

END OF MASTER PROMPT
