-- Slice 018: idempotent session requests bound to their normalized payload.
alter table public.service_sessions add column if not exists request_fingerprint text;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='service_sessions_request_fingerprint_hex' and conrelid='public.service_sessions'::regclass) then
  alter table public.service_sessions add constraint service_sessions_request_fingerprint_hex
   check (request_fingerprint ~ '^[0-9a-f]{64}$');
 end if;
end $$;
create or replace function public.session_request_fingerprint(_payload text) returns text
language sql immutable set search_path=pg_catalog as $$ select encode(sha256(convert_to(_payload,'UTF8')),'hex') $$;
revoke all on function public.session_request_fingerprint(text) from public;
grant execute on function public.session_request_fingerprint(text) to pospay_app;
create or replace function public.recorded_session_replay(_company uuid, _id uuid, _payload text)
returns text language plpgsql stable security definer set search_path=pg_catalog as $$
declare session_row record;
begin
 if not public.session_writer_any(_company) then raise exception 'FORBIDDEN'; end if;
 select s.recorded_by,s.branch_id,s.request_fingerprint into session_row
  from public.service_sessions s where s.company_id=_company and s.id=_id;
 if not found then return 'new'; end if;
 if session_row.recorded_by=public.current_app_user()
  and public.session_writer(_company,session_row.branch_id)
  and session_row.request_fingerprint=public.session_request_fingerprint(_payload)
 then return 'replay'; end if;
 return 'conflict';
end
$$;
revoke all on function public.recorded_session_replay(uuid,uuid,text) from public;
grant execute on function public.recorded_session_replay(uuid,uuid,text) to pospay_app;
