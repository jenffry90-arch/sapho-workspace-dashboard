create table if not exists task_scores (
  task_id text primary key,
  score integer not null check(score between 1 and 5),
  title text not null default '',
  project text not null default '',
  updated_at text not null
);

create table if not exists leisure_scores (
  item_id text primary key,
  scores_json text not null,
  overall integer not null check(overall between 0 and 100),
  title text not null default '',
  source text not null default '',
  updated_at text not null
);

create table if not exists hedonic_state (
  id text primary key,
  state_json text not null,
  updated_at text not null
);
