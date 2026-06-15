/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'

interface Props {
  clientName?: string
  label?: string
  amount?: string
  bankDetails?: string
  isFollowUp?: boolean
}

const PaymentReminder = ({ clientName, label, amount, bankDetails, isFollowUp }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{isFollowUp ? 'Follow-up reminder' : 'Payment reminder'} — {label || 'outstanding payment'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{clientName ? `Hi ${clientName},` : 'Hi,'}</Heading>
        <Text style={text}>
          {isFollowUp
            ? 'This is a follow-up to our previous reminder. The payment below is still showing as outstanding on our records.'
            : 'This is a reminder that the payment below is currently outstanding on our records.'}
        </Text>
        {label && <Text style={text}><strong>Payment:</strong> {label}</Text>}
        {amount && <Text style={text}><strong>Amount due:</strong> {amount}</Text>}
        {bankDetails && (
          <>
            <Text style={text}><strong>Bank transfer details:</strong></Text>
            <pre style={pre}>{bankDetails}</pre>
          </>
        )}
        <Text style={text}>
          Please send the transfer at your earliest convenience. Once received, we'll mark the payment as complete on your account and no further reminders will be sent.
        </Text>
        <Text style={text}>
          If you've already paid or have any questions, simply reply to this email.
        </Text>
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PaymentReminder,
  subject: (d: Record<string, any>) =>
    d?.isFollowUp
      ? `Follow-up: outstanding payment — ${d?.label || 'invoice'}`
      : `Payment reminder — ${d?.label || 'outstanding invoice'}`,
  displayName: 'Payment reminder',
  previewData: {
    clientName: 'Jane',
    label: 'Deposit (50% upfront)',
    amount: '$500 AUD',
    bankDetails: 'Account name: CareBridge Perth\nBSB: 000-000\nAccount: 0000 0000',
    isFollowUp: false,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const pre = { fontSize: '14px', color: 'hsl(210, 25%, 25%)', backgroundColor: 'hsl(210, 25%, 96%)', padding: '12px 16px', borderRadius: '12px', whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit', margin: '0 0 16px' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0', textAlign: 'center' as const }
