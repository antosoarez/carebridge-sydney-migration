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
  appointment_confirmed_client: (ctx) => {
    const kind = (ctx.vars?.kind as string) ?? "appointment";
    const when = (ctx.vars?.when as string) ?? "";
    const link = `${CLIENT_URL}/client/calendar`;
    const branded = {
      preheader: `Your ${kind} is booked.`,
      heading: "Your appointment is booked",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [`Your ${kind} is booked${when ? ` for ${when} (Perth time)` : ""}. Log in any time to see the details.`],
      ctaLabel: "View in your calendar", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: `Your ${kind} is booked`, html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Appointment booked", inappBody: `Your ${kind} is booked${when ? ` for ${when}` : ""}.`, link, inappKind: "appointment" };
  },
  appointment_confirmed_advocate: (ctx) => {
    const kind = (ctx.vars?.kind as string) ?? "appointment";
    const when = (ctx.vars?.when as string) ?? "";
    const who = ctx.clientName ? ` with ${ctx.clientName}` : "";
    const link = `${CLIENT_URL}/advocate/calendar`;
    const branded = {
      preheader: `A ${kind} was booked.`, heading: "New booking",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [`A ${kind}${who} was booked${when ? ` for ${when} (Perth time)` : ""}. Log in to view it.`],
      ctaLabel: "Open calendar", ctaUrl: link, closing: "— CareBridge",
    };
    return { subject: `New ${kind} booked${who}`, html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "New booking", inappBody: `A ${kind}${who} was booked${when ? ` for ${when}` : ""}.`, link, inappKind: "appointment" };
  },
  appointment_reminder: (ctx) => {
    const kind = (ctx.vars?.kind as string) ?? "appointment";
    const when = (ctx.vars?.when as string) ?? "";
    const link = `${CLIENT_URL}/client/calendar`;
    const branded = {
      preheader: `A reminder about your ${kind}.`, heading: "A gentle reminder",
      intro: greet(ctx.recipientName),
      bodyParagraphs: [`Just a reminder that your ${kind} is coming up${when ? ` — ${when} (Perth time)` : ""}. Log in for the details.`],
      ctaLabel: "View in your calendar", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: `Reminder: your ${kind} is coming up`, html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Appointment reminder", inappBody: `Your ${kind} is coming up${when ? ` — ${when}` : ""}.`, link, inappKind: "appointment" };
  },
  post_consultation: (ctx) => {
    const link = `${CLIENT_URL}/client`;
    const branded = {
      preheader: "Thank you for your consultation.", heading: "Thank you for today's consultation",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["I'll be working on your report and you'll receive it soon. If you need to share any additional documents, you can upload them in the app anytime."],
      ctaLabel: "Open your portal", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: "Thank you for your consultation", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Thanks for your consultation", inappBody: "Your report will be delivered soon. You can upload documents anytime.", link, inappKind: "appointment" };
  },
  report_ready: (ctx) => {
    const link = `${CLIENT_URL}/client/documents`;
    const branded = {
      preheader: "Your CareBridge report is ready.", heading: "Your report is ready 🌊",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["Your CareBridge report is ready — log in to view and download it from your Documents. It's designed to share with your treating doctor. Don't forget you have a free follow-up call included!"],
      ctaLabel: "View your report", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: "Your CareBridge report is ready", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Your report is ready", inappBody: "Log in to view and download your report — and book your free follow-up call.", link, inappKind: "report" };
  },
  followup_reminder: (ctx) => {
    const link = `${CLIENT_URL}/client/book-followup`;
    const branded = {
      preheader: "Book your free follow-up call.", heading: "Don't forget your free follow-up",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["You have a free follow-up call included with your CareBridge service. Log in whenever you're ready to book a time that suits you."],
      ctaLabel: "Book your follow-up", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: "Book your free CareBridge follow-up call", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Book your free follow-up", inappBody: "You have a free follow-up call included — log in to book it.", link, inappKind: "appointment" };
  },
  greeting_new: (ctx) => {
    const link = `${CLIENT_URL}/client`;
    const branded = {
      preheader: "Welcome to CareBridge.", heading: "Welcome to CareBridge 🌊",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["I'm Antonella, your health navigator. I've reviewed your intake and I'm ready to get started. If you have any questions, message me anytime in the app."],
      ctaLabel: "Open your portal", ctaUrl: link, closing: "Warmly, Antonella",
    };
    return { subject: "Welcome to CareBridge", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Welcome to CareBridge", inappBody: "I've reviewed your intake and I'm ready to get started. Message me anytime.", link, inappKind: "message" };
  },
  mood_sad_3days: (ctx) => {
    const link = `${CLIENT_URL}/client/messages`;
    const branded = {
      preheader: "Just checking in.", heading: "Just checking in",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["I noticed you've been feeling a bit low for the past few days. Just checking in — is there anything I can help with? Remember, you're not alone in this. 🌊"],
      ctaLabel: "Message your advocate", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: "Just checking in 🌊", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Just checking in", inappBody: "I noticed you've been feeling low lately — I'm here if you'd like to talk.", link, inappKind: "mood" };
  },
  reminder_gentle_7: (ctx) => {
    const link = `${CLIENT_URL}/client/todo`;
    const branded = {
      preheader: "A gentle reminder about your tasks.", heading: "A gentle reminder",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["Just a gentle reminder — you have some tasks waiting for you in the app. No pressure, but completing them helps us move your care forward. One step at a time. 🌊"],
      ctaLabel: "View your tasks", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: "A gentle reminder from CareBridge", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "A gentle reminder", inappBody: "You have some tasks waiting — take it one step at a time.", link, inappKind: "reminder" };
  },
  reminder_firm_14: (ctx) => {
    const link = `${CLIENT_URL}/client/todo`;
    const branded = {
      preheader: "Your tasks need a little attention.", heading: "Checking in on your tasks",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["I noticed some tasks have been pending for a couple of weeks. I know life gets busy, but these steps are important for your care journey. Can we chat about what's getting in the way?"],
      ctaLabel: "View your tasks", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: "Checking in on your CareBridge tasks", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Checking in on your tasks", inappBody: "Some tasks have been pending a while — can we chat about what's getting in the way?", link, inappKind: "reminder" };
  },
  reminder_daily_21: (ctx) => {
    const link = `${CLIENT_URL}/client/todo`;
    const branded = {
      preheader: "A small step today.", heading: "Take care of you today 🌊",
      intro: greet(ctx.recipientName),
      bodyParagraphs: ["Remember to take care of your health today. Your tasks are waiting for you in the app — even one small step makes a difference."],
      ctaLabel: "View your tasks", ctaUrl: link, closing: "Warmly, the CareBridge team",
    };
    return { subject: "A small step today 🌊", html: brandedEmailHtml(branded), text: brandedEmailText(branded),
      inappTitle: "Take care of you today", inappBody: "Even one small step on your tasks makes a difference. 🌊", link, inappKind: "reminder" };
  },
};

export function renderNotification(
  template: string,
  ctx: NotifyContext,
): RenderedNotification | null {
  const builder = TEMPLATES[template];
  return builder ? builder(ctx) : null;
}
