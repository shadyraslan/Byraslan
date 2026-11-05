-- ============ 0014 الموظفين: الوظيفة، الفرع الأساسي، ورقم الدخول (الموبايل) ============
alter table public.profiles add column if not exists job text;
alter table public.profiles add column if not exists home_loc text references public.locations;
alter table public.profiles add column if not exists login text;
