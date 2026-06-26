// Client-safe templates for automation_outbox notifications. NO PHI: only
// names, links, and amounts. Emails always say "log in to view"; never
// include health info, document content, or message bodies.
import { brandedEmailHtml, brandedEmailText } from "./branded-email.ts";

const CLIENT_URL = "https://client.carebridgeperth.com";

export interface NotifyContext {
  recipientName?: string | null; // first name of the recipient (for greeting)
  clientName?: string | null;    // subject client's name (advocate-facing only)
  vars?: Record<string, unknown>;
}

export interface RenderedNotification {
  subject: string;
  html: string;
  text: string;
  inappTitle: string;
  inappBody: string;
  link: string;
  inappKind: string;
}

type Builder = (ctx: NotifyContext) => RenderedNotification;

const greet = (n?: string | null) => (n ? `Hi ${n},` : "Hi,");

const TEMPLATES: Record<string, Builder> = {
  advocate_new_enquiry: (ctx) => {
    const who = ctx.clientName ? ` from ${ctx.clientName}` : "";
    const link = `${CLIENT_URL}/advocate`;
    const branded = {
      preheader: "A new enquiry is waiting in CareBridge.",
      heading: "New enquiry",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [
        `You have a new enquiry${who}. Log in to review the details and respond.`,
      ],
      ctaLabel: "Open CareBridge",
      ctaUrl: link,
      footnote: "For privacy, enquiry details are only shown in the portal.",
      closing: "— CareBridge",
    };
    return {
      subject: `New enquiry${who} — log in to review`,
      html: brandedEmailHtml(branded),
      text: brandedEmailText(branded),
      inappTitle: "New enquiry",
      inappBody: `A new enquiry${who} is waiting to be reviewed.`,
      link,
      inappKind: "enquiry",
    };
  },

  client_agreements_ready: (ctx) => {
    const link = `${CLIENT_URL}/client/agreements`;
    const branded = {
      preheader: "Your CareBridge agreements are ready to sign.",
      heading: "Your agreements are ready",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [
        "Your agreements are ready to review and sign. Log in to your portal to continue — it only takes a few minutes.",
      ],
      ctaLabel: "Review & sign",
      ctaUrl: link,
      closing: "Warmly, the CareBridge team",
    };
    return {
      subject: "Your CareBridge agreements are ready to sign",
      html: brandedEmailHtml(branded),
      text: brandedEmailText(branded),
      inappTitle: "Agreements ready to sign",
      inappBody: "Your agreements are ready — log in to review and sign.",
      link,
      inappKind: "agreements",
    };
  },

  client_payment_confirmed: (ctx) => {
    const link = `${CLIENT_URL}/client`;
    const branded = {
      preheader: "Your payment is confirmed.",
      heading: "Payment confirmed 🌊",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [
        "Thank you — your payment is confirmed and your CareBridge journey is underway. Log in any time to see your next steps.",
      ],
      ctaLabel: "Open your portal",
      ctaUrl: link,
      closing: "Warmly, the CareBridge team",
    };
    return {
      subject: "Payment confirmed — welcome to CareBridge",
      html: brandedEmailHtml(branded),
      text: brandedEmailText(branded),
      inappTitle: "Payment confirmed",
      inappBody: "Your payment is confirmed — log in to see your next steps.",
      link,
      inappKind: "payment",
    };
  },

  advocate_uploads_done: (ctx) => {
    const who = ctx.clientName ? ` from ${ctx.clientName}` : "";
    const link = `${CLIENT_URL}/advocate/documents`;
    const branded = {
      preheader: "A client has finished uploading their documents.",
      heading: "Documents ready to review",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [
        `A client${who} has finished uploading their documents. Log in to review the file and begin the work.`,
      ],
      ctaLabel: "Review documents",
      ctaUrl: link,
      footnote: "For privacy, document contents are only shown in the portal.",
      closing: "— CareBridge",
    };
    return {
      subject: `Documents ready to review${who}`,
      html: brandedEmailHtml(branded),
      text: brandedEmailText(branded),
      inappTitle: "Documents ready to review",
      inappBody: `A client${who} has finished uploading their documents.`,
      link,
      inappKind: "documents",
    };
  },

  advocate_payment_received: (ctx) => {
    const who = ctx.clientName ? ` from ${ctx.clientName}` : "";
    const link = `${CLIENT_URL}/advocate`;
    const branded = {
      preheader: "A payment has been received.",
      heading: "Payment received",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [
        `A payment has been received${who}. Log in to view the details and begin the work.`,
      ],
      ctaLabel: "Open CareBridge",
      ctaUrl: link,
      closing: "— CareBridge",
    };
    return {
      subject: `Payment received${who}`,
      html: brandedEmailHtml(branded),
      text: brandedEmailText(branded),
      inappTitle: "Payment received",
      inappBody: `A payment has been received${who}.`,
      link,
      inappKind: "payment",
    };
  },
};

export function renderNotification(
  template: string,
  ctx: NotifyContext,
): RenderedNotification | null {
  const builder = TEMPLATES[template];
  return builder ? builder(ctx) : null;
}
