-- ═══════════════════════════════════════════════════════════
-- Wah Tat 询盘表 (Inquiries)
-- 使用方法：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run
-- ═══════════════════════════════════════════════════════════

-- 询盘表
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 启用行级安全 (RLS)
alter table public.inquiries enable row level security;

-- 匿名访客（网站前端）只允许 INSERT（提交询盘），不允许读取/修改/删除
create policy "anon can insert inquiries"
  on public.inquiries
  for insert to anon
  with check (true);

-- 后台通过 service_role 密钥访问，自动绕过 RLS，无需额外策略
