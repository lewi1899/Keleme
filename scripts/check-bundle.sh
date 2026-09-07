#!/usr/bin/env bash
# =============================================================================
# Verifies the built client bundle carries no server-only secret.
#
# Run after `npm run build`. Next.js only inlines NEXT_PUBLIC_* into the client,
# so a leak here means something server-only was imported from a client
# component — the exact mistake `import "server-only"` in lib/supabase/admin.ts
# is there to catch at build time, checked again here at the artefact level.
#
# NOTE on the grep: the exit status of `grep ... | head` is head's, which is 0
# even when grep matched nothing. Capture the output and test THAT, never the
# pipeline's status.
# =============================================================================
set -uo pipefail

if [[ ! -d .next/static ]]; then
  echo "No .next/static — run 'npm run build' first."
  exit 1
fi

# The literal secret values that must never appear, plus the env var name.
PATTERNS=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "service_role"
  "KELEME_ADMIN_PASSWORD"
)

# The real service-role key from the environment, if one is set, so this
# catches an actual leaked value and not just a suspicious-looking string.
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  PATTERNS+=("$SUPABASE_SERVICE_ROLE_KEY")
fi

failed=0
for pattern in "${PATTERNS[@]}"; do
  matches="$(grep -rlF -- "$pattern" .next/static/ 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    echo "FAIL: '$pattern' appears in the client bundle:"
    echo "$matches" | sed 's/^/    /'
    failed=1
  else
    echo "ok: '$pattern' not present"
  fi
done

if [[ $failed -ne 0 ]]; then
  echo ""
  echo "A server-only value reached the browser bundle. Find the client"
  echo "component importing it and move that work to a server action."
  exit 1
fi

echo ""
echo "Client bundle is clean."
