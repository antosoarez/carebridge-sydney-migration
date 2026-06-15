// Calm, ocean-toned email bodies for the email-change flow.
// Two messages: one to the NEW address (with a confirmation button),
// one heads-up to the OLD address (no button, just reassurance).

import { brandedEmailHtml, brandedEmailText } from "./branded-email.ts";

export function verifyEmailChangeHtml(actionLink: string, newEmail: string, fullName?: string): string {
  return brandedEmailHtml({
    preheader: "Please confirm this is your correct email to keep your CareBridge account connected.",
    heading: "Please confirm your new email",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      `We received a request to update your CareBridge email to ${newEmail}.`,
      "Please tap the button below to confirm this is your correct email. Until you do, your existing email stays as your login — nothing changes.",
    ],
    ctaLabel: "Confirm this is my email",
    ctaUrl: actionLink,
    footnote: "This link is single-use and expires in 24 hours. If you didn't request this, you can safely ignore it.",
    closing: "Warmly, the CareBridge team",
  });
}

export function verifyEmailChangeText(actionLink: string, newEmail: string, fullName?: string): string {
  return brandedEmailText({
    preheader: "",
    heading: "Please confirm your new email",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      `We received a request to update your CareBridge email to ${newEmail}.`,
      "Confirm this is your correct email here:",
    ],
    ctaLabel: "Confirm this is my email",
    ctaUrl: actionLink,
    footnote: "Single-use, expires in 24 hours.",
    closing: "Warmly, the CareBridge team",
  });
}

export function emailChangeNoticeHtml(newEmailMasked: string, fullName?: string): string {
  return brandedEmailHtml({
    preheader: "A change to your CareBridge email was requested.",
    heading: "Heads-up: a change to your email was requested",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      `Someone requested to change the email on your CareBridge account to ${newEmailMasked}.`,
      "Until the new address is confirmed, this email stays as your login — nothing has changed yet.",
      "If you didn't ask for this, please reply to this message and we'll sort it out gently.",
    ],
    ctaLabel: "Contact CareBridge",
    ctaUrl: "mailto:hello@carebridgeperth.com?subject=Email%20change%20I%20didn%27t%20request",
    footnote: "We send this to keep you in the loop, just in case.",
    closing: "Warmly, the CareBridge team",
  });
}

export function emailChangeNoticeText(newEmailMasked: string, fullName?: string): string {
  return brandedEmailText({
    preheader: "",
    heading: "Heads-up: a change to your email was requested",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      `Someone requested to change the email on your CareBridge account to ${newEmailMasked}.`,
      "Until the new address is confirmed, this email stays as your login — nothing has changed yet.",
      "If you didn't ask for this, reply to this message and we'll sort it out.",
    ],
    ctaLabel: "Contact CareBridge",
    ctaUrl: "mailto:hello@carebridgeperth.com",
    footnote: "We send this to keep you in the loop.",
    closing: "Warmly, the CareBridge team",
  });
}

// foo@example.com -> f**@example.com  (calm masking for the heads-up email)
export function maskEmail(e: string): string {
  const [local, domain] = e.split("@");
  if (!domain) return e;
  const head = local.length <= 1 ? local : local[0];
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}
