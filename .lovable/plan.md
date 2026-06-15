Create a **Code of Conduct and Complaints** page in the client app with HaDSCO information.

## What we’re building
A new content page at `/client/code-of-conduct` that is visible only to logged-in clients. It will contain two sections:
1. **Our Code of Conduct** — drafted NDIS-aligned language covering respect, privacy, cultural safety, and communication standards.
2. **Making a Complaint** — the process for raising concerns, including the HaDSCO contact details the user provided.

## Page structure
- Route: `/client/code-of-conduct` (client-protected)
- Uses `AppShell` with role="client", SEO title "Code of Conduct and Complaints"
- Styled with existing glass-card, typography, and gradient classes to match the app
- Sections are scrollable, readable, and mobile-friendly

## Content included
**Code of Conduct**
- We treat every person with dignity, respect, and fairness.
- We protect your privacy and keep your information confidential.
- We communicate clearly and honestly.
- We respect your cultural background, identity, and preferences.
- We maintain professional boundaries.
- We work in your best interest and support your informed choices.

**Complaints**
> If something isn't right, we want to know. Please contact us directly first at hello@carebridgeperth.com. We will respond within 5 business days.
>
> If you are not satisfied with our response, or if you prefer to raise your concern independently, you have the right to contact:
> **Health and Disability Services Complaints Office (HaDSCO)**
> - Website: hadsco.wa.gov.au
> - Phone: 1800 813 583 (free call)
> - Email: hadsco@hadsco.wa.gov.au
> Complaints are free, confidential, and do not require a lawyer.

## Navigation
- Add a link in **Settings** (`/client/settings`) labeled "Code of Conduct & Complaints" that navigates to the new page.
- No entry in the main sidebar or bottom nav.

## Files to change
1. **New:** `src/pages/CodeOfConduct.tsx` — the page component
2. **Edit:** `src/App.tsx` — add route `<Route path="/client/code-of-conduct" element={<C><CodeOfConduct /></C>} />`
3. **Edit:** `src/pages/Settings.tsx` — add a link card/row pointing to `/client/code-of-conduct`