-- =============================================================================
-- KELEME — 0015 Default owner on user-owned rows
--
-- Fixes a real bug found while load testing: bookmarking was broken.
--
-- `bookmarks.user_id` is NOT NULL with no default, and the client sends only
-- content_id (it has no business asserting whose bookmark it is — the policy
-- would reject a forged value anyway). So every insert failed the WITH CHECK.
-- The button would have looked like it worked, thanks to the optimistic
-- update, then silently reverted.
--
-- Defaulting the column to auth.uid() is the idiomatic fix: the client never
-- sends it, the database fills it in from the verified session, and the
-- existing WITH CHECK still pins it — so this cannot be used to write a row
-- belonging to someone else.
-- =============================================================================

alter table public.bookmarks
  alter column user_id set default auth.uid();

alter table public.content_progress
  alter column user_id set default auth.uid();

comment on column public.bookmarks.user_id is
  'Defaults to auth.uid(). Clients never send this; the WITH CHECK policy pins it to the caller regardless.';
