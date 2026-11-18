-- Better Auth core tables (emailAndPassword, twoFactor, phoneNumber, passkey).
-- Generated with `@better-auth/cli generate`, made idempotent. Accessed only by the
-- server's owner connection; RLS on with no policies and REST grants revoked.
create table if not exists "user" ("id" text not null primary key, "email" text not null unique);
alter table "user" add column if not exists "name" text not null default '';
alter table "user" add column if not exists "emailVerified" boolean not null default false;
alter table "user" add column if not exists "image" text;
alter table "user" add column if not exists "createdAt" timestamptz default CURRENT_TIMESTAMP not null;
alter table "user" add column if not exists "updatedAt" timestamptz default CURRENT_TIMESTAMP not null;
alter table "user" add column if not exists "twoFactorEnabled" boolean;
alter table "user" add column if not exists "phoneNumber" text unique;
alter table "user" add column if not exists "phoneNumberVerified" boolean;

create table if not exists "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table if not exists "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
create table if not exists "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create table if not exists "twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "user" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);
create table if not exists "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" boolean not null, "transports" text, "createdAt" timestamptz, "aaguid" text);

create index if not exists "session_userId_idx" on "session" ("userId");
create index if not exists "account_userId_idx" on "account" ("userId");
create index if not exists "verification_identifier_idx" on "verification" ("identifier");
create index if not exists "twoFactor_secret_idx" on "twoFactor" ("secret");
create index if not exists "twoFactor_userId_idx" on "twoFactor" ("userId");
create index if not exists "passkey_userId_idx" on "passkey" ("userId");
create index if not exists "passkey_credentialID_idx" on "passkey" ("credentialID");

do $$
declare t text;
begin
  foreach t in array array['user','session','account','verification','twoFactor','passkey'] loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;
