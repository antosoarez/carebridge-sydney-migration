## Why you can't see it

- **Advocate side**: the "Payments" link **is** wired up — it's in the sidebar (`AppShell.tsx`, line 40) and routed at `/advocate/payments` in `App.tsx`. If it isn't appearing for you, it's likely a sidebar scroll / mobile drawer issue, not missing code.
- **Client side**: there is **no nav entry** for Payment at all. The client's payment page exists at `/client/payment`, but the only way a client lands there today is when the journey gate auto-redirects them. Nothing in the sidebar links to it, so it feels invisible.

## Plan

1. **Add a "Payment" item to the client sidebar** in `src/components/ocean/AppShell.tsx` (`clientNav` array), using the existing `Wallet` icon and pointing to `/client/payment`. Place it just below "Today" so it's prominent during the onboarding journey, and demote/hide it automatically once `profiles.payment_completed_at` is set so it doesn't clutter the nav afterwards.
2. **Add an attention dot** on the Payment nav item while the client still owes payment (reuse the existing `useAttentionBadges` pattern, or read `payment_completed_at` from the profile inside `AppShell`). This mirrors how Calendar/To-do already light up.
3. **Verify the advocate side**: no code change needed — confirm the link is in the sidebar at `/advocate/payments`. If you tell me you still can't see it after the rebuild, I'll check whether something is hiding it on your viewport (mobile drawer collapsed, sidebar overflow scrolling, etc.).

## Out of scope

- No changes to payment logic, Stripe, totals, or the journey gate order.
- No schema changes.
