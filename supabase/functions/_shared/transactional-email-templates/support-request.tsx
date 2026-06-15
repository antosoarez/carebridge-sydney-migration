/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'

interface Props {
  fromName?: string
  fromEmail?: string
  message?: string
  context?: string
}

const SupportRequest = ({ fromName, fromEmail, message, context }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{fromName || 'Someone'} needs a hand</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Need a hand 💛</Heading>
        <Text style={text}>
          {fromName || 'A client'}{fromEmail ? ` (${fromEmail})` : ''} has reached out for support.
        </Text>
        <Hr style={hr} />
        <Text style={label}>Their message</Text>
        <Text style={quote}>{message || '—'}</Text>
        {context && (
          <>
            <Text style={label}>Context</Text>
            <Text style={text}>{context}</Text>
          </>
        )}
        <Hr style={hr} />
        <Text style={footer}>Reply directly to this email to reach them. — {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportRequest,
  subject: (d: Record<string, any>) =>
    `Need a hand: ${d?.fromName || 'a client'} just reached out`,
  to: 'hello@carebridgeperth.com',
  displayName: 'Support request (Need a hand?)',
  previewData: {
    fromName: 'Maya Lindberg',
    fromEmail: 'maya@example.com',
    message: "I'm not sure how to upload my latest scans — could you walk me through it?",
    context: 'Sent from /client dashboard',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const label = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '16px 0 6px' }
const quote = { fontSize: '15px', color: 'hsl(210, 15%, 25%)', lineHeight: '1.6', margin: '0 0 12px', padding: '12px 14px', backgroundColor: 'hsl(210, 40%, 97%)', borderLeft: '3px solid hsl(210, 70%, 60%)', borderRadius: '6px', whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: 'hsl(210, 20%, 92%)', margin: '20px 0' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '20px 0 0', textAlign: 'center' as const }
