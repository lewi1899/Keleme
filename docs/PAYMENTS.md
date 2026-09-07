# Payments

**No payment provider is connected in this release.** That is deliberate, and
it is not the same thing as payments not working — the full money path is
built, exercised and tested. What is missing is one adapter.

The spec is explicit that faking a successful payment is not acceptable. So
rather than a "Pay" button that pretends, KELEME ships the workflow the team
can actually operate on launch day.

---

## How it works today

```
Student picks a plan
        │
        ▼
request_plan(plan_id)          ← amount read FROM THE PLAN, never from the client
        │
        ▼
payments row, status = pending  ← student is shown the amount + a reference
        │
        ▼
Student pays through your existing channel, quoting the reference
        │
        ▼
Admin → Payments → Confirm
        │
        ▼
confirm_payment()               ← the ONLY thing that creates an entitlement
        │
        ▼
Student has access immediately
```

Three properties matter here, and they are the ones a provider integration
would otherwise have to re-establish:

1. **The amount comes from the plan row.** A client cannot ask to buy a year of
   Premium for one birr. The RLS suite asserts this.
2. **A pending payment grants nothing.** Access follows the entitlement, and
   the entitlement follows confirmation.
3. **Confirmation is idempotent.** Confirming twice returns the same
   entitlement rather than granting a second one — which is exactly the
   property that makes a replayed webhook harmless.

Students cannot confirm their own payments, and cannot call the admin wrapper.
Both are asserted in the test suite.

---

## Why not connect a provider now

Chapa and Telebirr both need business onboarding before they will issue live
credentials — a licence, vetting, and in Telebirr's case IP whitelisting. That
is a commercial timeline, not an engineering one. Building against credentials
you do not have yet produces untested code that everyone believes works.

The manual flow is not a placeholder for that: it is how the team already takes
money, made auditable.

---

## Integrating a provider

The work is one adapter and one webhook route. Nothing about the schema, the
entitlement path or the admin screens changes.

### 1. The adapter

Create `src/lib/payments/<provider>.ts` exposing three functions:

```ts
export interface PaymentProvider {
  /** Start a checkout. Returns the URL to send the student to. */
  initialize(input: {
    paymentId: string;
    amount: number;
    currency: string;
    email: string;
    phone: string;
    returnUrl: string;
    callbackUrl: string;
  }): Promise<{ redirectUrl: string; providerReference: string }>;

  /** Confirm a transaction out-of-band, for the return page. */
  verify(providerReference: string): Promise<{ paid: boolean; amount: number }>;

  /** Validate a webhook signature. Never skip this. */
  verifySignature(rawBody: string, signature: string): boolean;
}
```

Keep it a sibling file rather than branching inside an existing one — a second
provider later should be a new file, not an `if`.

### 2. The webhook

Create `src/app/api/payments/webhook/route.ts`:

```ts
export async function POST(request: Request) {
  const raw = await request.text();          // raw body — signature is over bytes
  const signature = request.headers.get("x-provider-signature") ?? "";

  if (!provider.verifySignature(raw, signature)) {
    return new Response("invalid signature", { status: 401 });
  }

  const event = JSON.parse(raw);
  if (event.status !== "success") return new Response("ok");

  // Service role: a webhook arrives with no user session.
  const admin = createAdminClient();
  await admin.rpc("confirm_payment", {
    p_payment_id: event.metadata.payment_id,
    p_provider_reference: event.reference,
  });

  return new Response("ok");
}
```

Four things to get right:

- **Verify the signature over the raw body**, before parsing. Parsing first and
  re-serialising changes the bytes and the signature will never match.
- **Return 200 for events you ignore.** A non-2xx makes most providers retry
  forever.
- **Do not trust the amount in the payload.** `confirm_payment` grants the
  duration from the plan row, so a tampered amount cannot buy a longer
  subscription. Log a mismatch; do not act on it.
- **Idempotency is already handled** by `confirm_payment` and by the unique
  index on `(provider, provider_reference)`.

### 3. Wire up checkout

In `PlanPicker`, replace the modal that shows the reference with a redirect to
`initialize()`'s URL. Keep `request_plan` as the first step — it is what
creates the payment row the provider's metadata will point at.

### 4. Environment

```bash
PAYMENT_PROVIDER="chapa"
PAYMENT_SECRET_KEY="..."
PAYMENT_WEBHOOK_SECRET="..."   # only if the provider issues a separate one
```

### 5. Test before switching over

- A successful payment grants exactly the plan's duration
- A replayed webhook grants nothing extra
- A tampered amount does not extend the subscription
- An invalid signature is rejected with 401
- A failed payment leaves the row `pending` and grants nothing

The manual flow can stay switched on alongside a provider — some students will
always prefer to pay in cash through someone they know.

---

## Refunds

There is no automated refund handling: neither candidate provider sends a
refund webhook in the integrations considered.

To refund: process it with the provider, then revoke the entitlement in
Admin → Students. The revocation is audited, and access ends immediately rather
than at the end of the period.
