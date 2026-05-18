
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#22c55e',
  logo_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  avatar_url text,
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now()
);

create type public.gym_status as enum ('yes','no','home');

create table public.gym_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  status public.gym_status not null,
  created_at timestamptz not null default now(),
  unique (member_id, date)
);

create table public.deep_work (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  topic text,
  minutes int,
  started_at timestamptz,
  finished_at timestamptz,
  learnings text,
  personal_notes text,
  created_at timestamptz not null default now()
);

create table public.dw_comments (
  id uuid primary key default gen_random_uuid(),
  deep_work_id uuid not null references public.deep_work(id) on delete cascade,
  author_id uuid not null references public.members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  sleep_time time,
  wake_time time,
  hours numeric(4,2),
  free_day boolean not null default false,
  created_at timestamptz not null default now(),
  unique (member_id, date)
);

create table public.sleep_targets (
  member_id uuid primary key references public.members(id) on delete cascade,
  target_sleep time,
  target_wake time
);

create table public.macros_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  calories int,
  protein int,
  carbs int,
  fat int,
  sugar int,
  water int,
  created_at timestamptz not null default now(),
  unique (member_id, date)
);

create table public.scoring_rules (
  category text primary key,
  points_per_entry numeric(4,2) not null default 0.2,
  weekly_cap numeric(4,2) not null default 1.0
);

create table public.free_days (
  date date primary key,
  label text
);

-- Enable RLS, public read/write (no auth group app)
alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.gym_logs enable row level security;
alter table public.deep_work enable row level security;
alter table public.dw_comments enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.sleep_targets enable row level security;
alter table public.macros_logs enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.free_days enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['teams','members','gym_logs','deep_work','dw_comments','sleep_logs','sleep_targets','macros_logs','scoring_rules','free_days'])
  loop
    execute format('create policy "public read %1$s" on public.%1$I for select using (true);', t);
    execute format('create policy "public insert %1$s" on public.%1$I for insert with check (true);', t);
    execute format('create policy "public update %1$s" on public.%1$I for update using (true);', t);
    execute format('create policy "public delete %1$s" on public.%1$I for delete using (true);', t);
  end loop;
end$$;
