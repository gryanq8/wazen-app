-- Wazen Supabase schema - المرحلة القادمة
-- هذا الملف لا يستخدم في نسخة GitHub Pages الحالية.
-- يستخدم لاحقًا عند الانتقال إلى قاعدة بيانات Supabase.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table salaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_amount numeric(12,3) not null default 0,
  next_salary_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,3) not null,
  source text not null,
  income_date date not null,
  recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,3) not null,
  category text not null,
  note text,
  expense_date date not null,
  entry_method text not null default 'quick',
  created_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12,3) not null,
  saved_amount numeric(12,3) not null default 0,
  due_date date not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

create table obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,3) not null,
  type text not null check (type in ('continuous', 'temporary')),
  due_day int not null check (due_day between 1 and 31),
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'inactive', 'done')),
  created_at timestamptz not null default now()
);

create table ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_summary jsonb not null,
  ai_output text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table salaries enable row level security;
alter table incomes enable row level security;
alter table expenses enable row level security;
alter table goals enable row level security;
alter table obligations enable row level security;
alter table ai_reports enable row level security;

-- المستخدم يرى بياناته فقط
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "salaries_all_own" on salaries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "incomes_all_own" on incomes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_all_own" on expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_all_own" on goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "obligations_all_own" on obligations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_reports_all_own" on ai_reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
