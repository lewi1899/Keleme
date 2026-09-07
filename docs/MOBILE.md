# Reusing this backend for a mobile app

The Play Store release is a client swap, not a rewrite. Everything the web app
depends on already lives behind Supabase's HTTP API, and every rule is in the
database rather than in the Next.js layer — so a native client that talks to
the same project gets the same guarantees automatically.

---

## What ports unchanged

| Concern | Why it is already portable |
|---|---|
| Auth | Supabase Auth has first-class Kotlin, Swift and Flutter SDKs. Same users, same JWTs. |
| Authorization | RLS runs in the database. A native client cannot bypass what the web client cannot bypass. |
| Content | `get_content_html()`, `get_matric_questions()`, `get_leaderboard()` are RPCs — plain HTTP POSTs. |
| Time tracking | `record_heartbeat()` is an RPC. A foreground service calls it on the same 60-second cadence. |
| Single session | `on_sign_in` / `validate_device_session` are RPCs. The device token goes in EncryptedSharedPreferences or the Keychain instead of a cookie. |
| Payments | `request_plan` and `confirm_payment` are unchanged. In-app purchase becomes another adapter. |
| Entitlements | `has_active_entitlement` is the single authority for every client. |

Nothing on that list needs a new endpoint.

---

## What the mobile app can do better

### Screenshot blocking

The one protection a browser genuinely cannot provide.

```kotlin
// Any Activity showing premium content
window.setFlags(
    WindowManager.LayoutParams.FLAG_SECURE,
    WindowManager.LayoutParams.FLAG_SECURE
)
```

`FLAG_SECURE` blocks screenshots, screen recording and thumbnails in the
recents list. iOS has no direct equivalent; the usual approach is detecting
`UIScreen.capturedDidChangeNotification` and blanking the view.

This is why HTML content is delivered as a **string through an RPC** rather
than as a file: the native app renders it into a `FLAG_SECURE` WebView with no
file ever touching disk. Had it been a storage object, the URL would be
shareable and the flag would protect nothing.

### Offline premium content

The web app cannot offer real offline DRM, and does not pretend to. A native
app can:

1. Fetch content through the same authorised RPC.
2. Store it **encrypted** in app-private storage
   (`EncryptedFile` / `Context.MODE_PRIVATE`, or the iOS Keychain for the key).
3. Stamp each cached item with the entitlement's `ends_at`.
4. Re-validate on every launch that has connectivity; refuse and purge when the
   entitlement has lapsed.
5. Cap offline access to a fixed window — a fortnight is typical — so a device
   kept permanently offline cannot hold premium content forever.

`entitlement_expires_at()` already returns exactly the timestamp step 3 needs.

### Push notifications

Streak reminders and weekly-prize announcements are the obvious uses. The
`daily_activity` and `weekly_reward_winners` tables already hold what a
scheduled job would read; add FCM tokens as a table keyed by user and a
Supabase Edge Function to send them.

---

## What to build

```
android/
  auth      → supabase-kt Auth, device token in EncryptedSharedPreferences
  content   → RPC calls, encrypted offline cache
  study     → foreground service calling record_heartbeat
  ui        → Compose; FLAG_SECURE on protected screens
```

**Do not add a bespoke mobile API.** The temptation is a "mobile BFF" that
wraps the same queries. It would double every authorization rule, and the
second copy is where the bug lands. Talk to Supabase directly.

---

## Before submitting to the Play Store

- [ ] `FLAG_SECURE` on every premium-content screen
- [ ] Offline cache encrypted and entitlement-stamped
- [ ] Device token in encrypted storage, never plain preferences
- [ ] Certificate pinning against the Supabase domain
- [ ] Privacy policy covering study time, streaks and leaderboard opt-in
- [ ] Data safety form declaring what is collected — phone, email, school, study time
- [ ] Account deletion reachable in-app (Play policy requires it):
      `profiles.deactivated_at` is the existing mechanism
- [ ] Anonymised leaderboard verified on device — no real names for
      non-opted-in students

---

## Web PWA in the meantime

The web app ships `manifest.json` and themed icons, so it installs to a home
screen and runs standalone today. That covers the gap until the native app
ships, with the honest caveat that a PWA gets none of the three advantages
above — no `FLAG_SECURE`, no encrypted offline store, no reliable push on iOS.
