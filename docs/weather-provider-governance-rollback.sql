-- For a disposable validation database or an approved rollback after exporting
-- any governance records. Never removes existing weather_provider_connections.
begin;
drop table if exists public.weather_provider_audit_events;
drop table if exists public.weather_product_entitlements;
drop table if exists public.weather_license_reviews;
drop table if exists public.weather_product_catalog;
drop table if exists public.weather_provider_catalog;
commit;
