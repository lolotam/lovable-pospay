-- Prepared only. Apply in filename order alongside 0021_phone_self_unbind.sql.
create or replace function public.attendance_daily(_company uuid, _branch uuid, _from date, _to date)
returns table(day date,on_time int,late int,forgotten int,avg_late numeric)
language sql stable security definer set search_path=public as $$
 select d::date,
 count(a.id) filter(where a.status<>'forgotten' and a.late_minutes=0)::int,
 count(a.id) filter(where a.status<>'forgotten' and a.late_minutes>0)::int,
 count(a.id) filter(where a.status='forgotten')::int,
 avg(a.late_minutes) filter(where a.late_minutes>0)
 from generate_series(_from::timestamp,_to::timestamp,interval '1 day') d
 left join attendance_records a on a.company_id=_company and a.work_date=d::date
 and (_branch is null or a.branch_id=_branch) and public.report_reader(_company,a.branch_id)
 where public.report_reader(_company,_branch) and public.has_permission(_company,'reports.view')
 group by d order by d
$$;
create or replace function public.late_leaders(_company uuid, _branch uuid, _from date, _to date)
returns table(staff_id uuid,name text,late_minutes bigint)
language sql stable security definer set search_path=public as $$
 select a.staff_id,s.display_name,sum(a.late_minutes)::bigint
 from attendance_records a join staff_members s on s.company_id=a.company_id and s.id=a.staff_id
 where a.company_id=_company and a.work_date between _from and _to and a.late_minutes>0
 and (_branch is null or a.branch_id=_branch) and public.report_reader(_company,_branch)
 and public.report_reader(_company,a.branch_id) and public.has_permission(_company,'reports.view')
 group by a.staff_id,s.display_name order by sum(a.late_minutes) desc,a.staff_id limit 5
$$;
create or replace function public.session_daily(_company uuid, _branch uuid, _from date, _to date)
returns table(day date,sessions int,revenue_mills bigint)
language sql stable security definer set search_path=public as $$
 select d::date,count(s.id)::int,coalesce(sum(s.price_mills),0)::bigint
 from generate_series(_from::timestamp,_to::timestamp,interval '1 day') d
 left join (service_sessions s join branches b on b.company_id=s.company_id and b.id=s.branch_id)
 on s.company_id=_company and (s.occurred_at at time zone b.timezone)::date=d::date
 and (_branch is null or s.branch_id=_branch) and public.report_reader(_company,s.branch_id)
 where public.report_reader(_company,_branch) and public.has_permission(_company,'reports.view')
 group by d order by d
$$;
create or replace function public.platform_growth(_weeks int)
returns table(week date,companies bigint,users bigint)
language sql stable security definer set search_path=public as $$
 select d::date,
 (select count(*) from companies c where c.created_at>=d and c.created_at<d+interval '1 week'),
 (select count(*) from public."user" u where u."createdAt">=d and u."createdAt"<d+interval '1 week')
 from generate_series(date_trunc('week',current_timestamp)-((least(greatest(_weeks,1),12)-1)*interval '1 week'),
 date_trunc('week',current_timestamp),interval '1 week') d
 where public.is_super_admin() order by d
$$;
revoke all on function public.attendance_daily(uuid,uuid,date,date),public.late_leaders(uuid,uuid,date,date),public.session_daily(uuid,uuid,date,date),public.platform_growth(int) from public;
grant execute on function public.attendance_daily(uuid,uuid,date,date),public.late_leaders(uuid,uuid,date,date),public.session_daily(uuid,uuid,date,date),public.platform_growth(int) to pospay_app;