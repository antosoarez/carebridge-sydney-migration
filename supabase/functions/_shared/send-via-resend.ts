// Minimal Resend sender used by the CareBridge edge functions.
// Reads RESEND_API_KEY from the function environment. Sends from the
// verified Resend sender on notify.carebridgeperth.com.

import { brandedEmailHtml, brandedEmailText } from "./branded-email.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const RESEND_FROM = "CareBridge <hello@notify.carebridgeperth.com>";
export const RESEND_REPLY_TO = "hello@carebridgeperth.com";

export interface ResendSendInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendViaResend(input: ResendSendInput): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      reply_to: RESEND_REPLY_TO,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      // List-Unsubscribe improves deliverability and lets clients show a
      // one-click unsubscribe affordance. Mailto is sufficient for
      // transactional messages.
      headers: {
        "List-Unsubscribe": `<mailto:${RESEND_REPLY_TO}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed [${res.status}]: ${body}`);
  }
}

// ---------- Invite template ----------

export function inviteEmailHtml(actionLink: string, fullName?: string): string {
  return brandedEmailHtml({
    preheader: "Your advocate has set up your CareBridge account — activate it here.",
    heading: "You're invited to CareBridge",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      "Your advocate has set up a CareBridge account for you. CareBridge is a calm, private space where the two of you can share documents, messages and appointments.",
      "To activate your account and set a password, tap the button below.",
    ],
    ctaLabel: "Activate your account",
    ctaUrl: actionLink,
    footnote: "This link is single-use and will expire. Keep it private.",
    closing: "Warmly, the CareBridge team",
  });
}

export function inviteEmailText(actionLink: string, fullName?: string): string {
  return brandedEmailText({
    preheader: "",
    heading: "You're invited to CareBridge",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      "Your advocate has set up a CareBridge account for you. CareBridge is a calm, private space where the two of you can share documents, messages and appointments.",
      "Activate your account and set a password here:",
    ],
    ctaLabel: "Activate your account",
    ctaUrl: actionLink,
    footnote: "This link is single-use and will expire. Keep it private.",
    closing: "Warmly, the CareBridge team",
  });
}

// ---------- Password reset template ----------

export function resetEmailHtml(actionLink: string, fullName?: string): string {
  return brandedEmailHtml({
    preheader: "Reset your CareBridge password.",
    heading: "Reset your CareBridge password",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      "We received a request to reset the password on your CareBridge account. Tap the button below to choose a new password.",
      "If it wasn't you, you can safely ignore this email — your password won't change.",
    ],
    ctaLabel: "Reset password",
    ctaUrl: actionLink,
    footnote: "This link is single-use and will expire shortly.",
    closing: "Warmly, the CareBridge team",
  });
}

export function resetEmailText(actionLink: string, fullName?: string): string {
  return brandedEmailText({
    preheader: "",
    heading: "Reset your CareBridge password",
    intro: fullName ? `Hi ${fullName},` : "Hi,",
    bodyParagraphs: [
      "We received a request to reset the password on your CareBridge account. Open this link to choose a new password:",
      "If it wasn't you, you can safely ignore this email — your password won't change.",
    ],
    ctaLabel: "Reset password",
    ctaUrl: actionLink,
    footnote: "This link is single-use and will expire shortly.",
    closing: "Warmly, the CareBridge team",
  });
}

// ---------- New message notification template ----------

export interface NewMessageEmailInput {
  recipientName?: string | null;
  senderName?: string | null;
  isFollowUp?: boolean;
  messagesUrl?: string;
}

export function newMessageEmailSubject(i: NewMessageEmailInput): string {
  const who = i.senderName || "your CareBridge contact";
  return i.isFollowUp
    ? `A gentle reminder — message from ${who}`
    : `A message from ${who}`;
}

function newMessageBranded(i: NewMessageEmailInput) {
  const who = i.senderName || "someone in CareBridge";
  const url = i.messagesUrl || "https://www.client.carebridgeperth.com/messages";
  const intro = i.recipientName ? `Hi ${i.recipientName},` : "Hi,";
  const line = i.isFollowUp
    ? `Just a soft reminder — ${who} sent you a message in CareBridge that's still waiting whenever you're ready.`
    : `${who} sent you a message in CareBridge. No rush — open it whenever works for you.`;
  const preheader = i.isFollowUp
    ? `Just a soft reminder — you have an unread message from ${who}.`
    : `You have a new message from ${who} in CareBridge.`;
  return {
    preheader,
    heading: intro,
    intro: line,
    ctaLabel: "Open your messages",
    ctaUrl: url,
    softNote: i.isFollowUp
      ? "If we don't hear from you, your advocate may reach out by phone or another way just to check in."
      : undefined,
    footnote: "For your privacy, we never include the message itself in this email.",
    closing: "Warmly, the CareBridge team",
  };
}

export function newMessageEmailHtml(i: NewMessageEmailInput): string {
  return brandedEmailHtml(newMessageBranded(i));
}

export function newMessageEmailText(i: NewMessageEmailInput): string {
  return brandedEmailText(newMessageBranded(i));
}

