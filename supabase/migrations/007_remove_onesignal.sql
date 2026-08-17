-- Native Web Push uses profiles.push_subscription only.
alter table public.profiles drop column if exists onesignal_player_id;
