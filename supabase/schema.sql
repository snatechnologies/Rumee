-- Rumee — Supabase schema
-- Run this once in the Supabase SQL editor (or `supabase db push`).
-- Per the project brief this is a closed-group app: NO RLS is enabled and
-- the anon key can read/write these tables directly. Do not reuse this
-- schema for a public app without adding policies.

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  invite_token uuid not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  host_player_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null,
  seat int not null,
  is_host boolean not null default false,
  is_ready boolean not null default false,
  total_score int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references rooms(id) on delete cascade,
  round_number int not null default 1,
  status text not null default 'playing' check (status in ('playing', 'round_end', 'match_end')),
  deck jsonb not null default '[]'::jsonb,
  discard jsonb not null default '[]'::jsonb,
  wild_rank int not null default 0,
  current_seat int not null default 0,
  phase text not null default 'draw' check (phase in ('draw', 'discard', 'done')),
  drawn_card text,
  drawn_from text,
  turn_deadline timestamptz,
  version int not null default 1,
  reshuffles int not null default 0,
  declarer_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists player_hands (
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references room_players(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create table if not exists game_moves (
  id bigint generated always as identity primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  round_number int not null,
  player_id uuid,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists round_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_number int not null,
  player_id uuid not null references room_players(id) on delete cascade,
  points int not null,
  multiplier int not null default 1,
  scored int not null,
  is_declarer boolean not null default false,
  groups jsonb not null default '[]'::jsonb,
  ungrouped jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (room_id, round_number, player_id)
);

-- Server-side clock used for authoritative turn deadlines.
create or replace function server_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

-- Enable realtime change feeds for every table the clients subscribe to.
do $$
begin
  alter publication supabase_realtime add table rooms;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table room_players;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table games;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table player_hands;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table round_results;
exception when duplicate_object then null;
end $$;
