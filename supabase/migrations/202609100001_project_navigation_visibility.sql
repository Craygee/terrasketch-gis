-- Independent per-project navigation visibility. Existing and new projects remain
-- visible by default so applying this migration does not empty either switcher.

alter table public.projects
  add column if not exists show_in_quick_switch boolean not null default true;

alter table public.projects
  add column if not exists show_in_mobile_bar boolean not null default true;

comment on column public.projects.show_in_quick_switch is
  'Whether this project appears in the desktop quick-switch navigation.';

comment on column public.projects.show_in_mobile_bar is
  'Whether this project appears in the compact mobile project navigation.';
