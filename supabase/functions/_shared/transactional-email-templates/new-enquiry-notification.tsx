/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'

interface Props {
  name?: string
  email?: string
  phone?: string
  message?: string
  source?: string
  preferredContact?: string
  serviceInterest?: string
  inboxUrl?: string
}

const NewEnquiryNotification = ({
  name, email, phone, message, source, preferredContact, serviceInterest, inboxUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{name || 'Someone'} just sent a new enquiry</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New enquiry 🌿</Heading>
        <Text style={text}>
          <strong>{name || 'Someone'}</strong> just reached out through the website.
        </Text>

        <Hr style={hr} />

        <Text style={label}>From</Text>
        <Text style={text}>{name || '—'}{email ? ` · ${email}` : ''}</Text>

        {phone && (
          <>
            <Text style={label}>Phone</Text>
            <Text style={text}>{phone}</Text>
          </>
        )}

        {preferredContact && (
          <>
            <Text style={label}>Prefers</Text>
            <Text style={text}>{preferredContact}</Text>
          </>
        )}

        {serviceInterest && (
          <>
            <Text style={label}>Interested in</Text>
            <Text style={text}>{serviceInterest}</Text>
          </>
        )}

        {message && (
          <>
            <Text style={label}>Their message</Text>
            <Text style={quote}>{message}</Text>
          </>
        )}

        {source && (
          <>
            <Text style={label}>Source</Text>
            <Text style={text}>{source}</Text>
          </>
        )}

        <Hr style={hr} />

        {inboxUrl && (
          <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
            <Button href={inboxUrl} style={button}>Open in advocate inbox</Button>
          </Section>
        )}

        <Text style={footer}>A reply task has been added automatically. — {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NewEnquiryNotification,
  subject: (d: Record<string, any>) => `New enquiry from ${d?.name || 'website visitor'}`,
  to: 'hello@carebridgeperth.com',
  displayName: 'New website enquiry',
  previewData: {
    name: 'Sam Carter',
    email: 'sam@example.com',
    phone: '+61 400 000 000',
    message: 'Hi — I would love to learn more about your advocacy services for my dad.',
    source: 'website_form',
    preferredContact: 'Phone, weekday mornings',
    serviceInterest: 'Hospital advocacy',
    inboxUrl: 'https://www.client.carebridgeperth.com/advocate',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const label = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '16px 0 6px' }
const quote = { fontSize: '15px', color: 'hsl(210, 15%, 25%)', lineHeight: '1.6', margin: '0 0 12px', padding: '12px 14px', backgroundColor: 'hsl(210, 40%, 97%)', borderLeft: '3px solid hsl(210, 70%, 60%)', borderRadius: '6px', whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: 'hsl(210, 20%, 92%)', margin: '20px 0' }
const button = { backgroundColor: 'hsl(205, 75%, 45%)', color: '#ffffff', padding: '12px 22px', borderRadius: '14px', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '20px 0 0', textAlign: 'center' as const }
