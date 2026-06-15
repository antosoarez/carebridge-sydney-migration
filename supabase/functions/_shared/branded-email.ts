// Shared CareBridge-branded HTML/text shell used by all Resend-sent emails
// (invite, resend-invite, password reset). Keep visuals consistent: navy
// #1C2B3A text, sage #8BA888 accents, calm wording, no scary red.

const NAVY = "#1C2B3A";
const SAGE = "#8BA888";
const MUTED = "#55636F";
const BG = "#F6F4EF";
const CARD = "#FFFFFF";

export interface BrandedEmailInput {
  preheader: string;       // hidden preview text shown by mail clients
  heading: string;         // H1
  intro: string;           // first paragraph (may be greeting + sentence)
  bodyParagraphs?: string[]; // additional paragraphs
  ctaLabel: string;
  ctaUrl: string;
  softNote?: string;       // gentle paragraph rendered between CTA and footnote
  footnote?: string;       // small reassurance line, e.g. "single-use, expires soon"
  closing?: string;        // e.g. "Warmly, the CareBridge team"
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

export function brandedEmailHtml(i: BrandedEmailInput): string {
  const extras = (i.bodyParagraphs ?? [])
    .map((p) => `<p style="font-size:15px;line-height:1.6;color:${NAVY};margin:0 0 16px;">${esc(p)}</p>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(i.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${NAVY};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(i.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${CARD};border-radius:12px;border:1px solid #E6E2D9;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;border-bottom:1px solid #EFEBE2;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;">
              <div style="width:32px;height:32px;border-radius:50%;background:${SAGE};display:inline-block;text-align:center;line-height:32px;color:#fff;font-weight:700;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">CB</div>
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:16px;font-weight:700;color:${NAVY};letter-spacing:0.2px;">CareBridge</div>
              <div style="font-size:12px;color:${MUTED};">Perth advocacy &amp; support</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${NAVY};font-weight:700;">${esc(i.heading)}</h1>
          <p style="font-size:15px;line-height:1.6;color:${NAVY};margin:0 0 16px;">${esc(i.intro)}</p>
          ${extras}
          <p style="margin:24px 0 8px;">
            <a href="${i.ctaUrl}" style="display:inline-block;background:${SAGE};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">${esc(i.ctaLabel)}</a>
          </p>
          ${i.softNote ? `<p style="font-size:14px;line-height:1.6;color:${NAVY};background:#eef4f0;border-left:3px solid ${SAGE};padding:12px 14px;border-radius:8px;margin:18px 0 8px;">${esc(i.softNote)}</p>` : ""}
          ${i.footnote ? `<p style="font-size:13px;color:${MUTED};margin:4px 0 16px;">${esc(i.footnote)}</p>` : ""}
          <p style="font-size:13px;color:${MUTED};margin:16px 0 6px;">If the button doesn't work, copy and paste this link:</p>
          <p style="font-size:13px;color:${MUTED};word-break:break-all;margin:0 0 8px;"><a href="${i.ctaUrl}" style="color:${MUTED};text-decoration:underline;">${esc(i.ctaUrl)}</a></p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #EFEBE2;">
          ${i.closing ? `<p style="font-size:14px;color:${NAVY};margin:8px 0 12px;">${esc(i.closing)}</p>` : ""}
          <p style="font-size:12px;color:${MUTED};margin:0 0 4px;">CareBridge — independent advocacy in Perth, WA</p>
          <p style="font-size:12px;color:${MUTED};margin:0;">Replies go to <a href="mailto:hello@carebridgeperth.com" style="color:${MUTED};">hello@carebridgeperth.com</a>. If you weren't expecting this email, you can safely ignore it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function brandedEmailText(i: BrandedEmailInput): string {
  const parts = [
    i.heading,
    "",
    i.intro,
    ...(i.bodyParagraphs ?? []),
    "",
    `${i.ctaLabel}: ${i.ctaUrl}`,
  ];
  if (i.softNote) parts.push("", i.softNote);
  if (i.footnote) parts.push("", i.footnote);
  parts.push(
    "",
    i.closing ?? "— CareBridge",
    "CareBridge — independent advocacy in Perth, WA",
    "Replies: hello@carebridgeperth.com",
    "If you weren't expecting this email, you can safely ignore it.",
  );
  return parts.join("\n");
}
