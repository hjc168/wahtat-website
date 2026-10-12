-- ═══════════════════════════════════════════════════════════
-- Wah Tat 询盘表 (Inquiries)
-- 使用方法：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run
-- 本脚本幂等，可重复执行
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

-- 启用行级安全 (RLS)：访客无法直接读写表
alter table public.inquiries enable row level security;

-- ── 提交询盘函数（SECURITY DEFINER 绕过 RLS，只开放给匿名访客调用）──
create or replace function public.submit_inquiry(
  p_name text,
  p_email text,
  p_subject text,
  p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.inquiries (name, email, subject, message)
  values (p_name, p_email, p_subject, p_message);
$$;

-- 仅匿名访客可调用（网站前端），防止其他角色滥用
grant execute on function public.submit_inquiry(text, text, text, text) to anon;
revoke execute on function public.submit_inquiry(text, text, text, text) from public;
revoke execute on function public.submit_inquiry(text, text, text, text) from authenticated;

-- 后台通过 service_role 密钥直接读写表，自动绕过 RLS，无需额外策略
