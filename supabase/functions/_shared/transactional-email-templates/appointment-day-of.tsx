/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'

interface Props {
  clientName?: string
  title?: string
  whenLabel?: string
  location?: string
  notes?: string
}

const AppointmentDayOf = ({ clientName, title, whenLabel, location, notes }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Today: {title || 'your appointment'}{whenLabel ? ` — ${whenLabel}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{clientName ? `Morning, ${clientName} 🌊` : 'Morning 🌊'}</Heading>
        <Text style={text}>
          Just a calm heads-up — you have an appointment today. No rush, you've got this.
        </Text>
        {title && <Text style={text}><strong>What:</strong> {title}</Text>}
        {whenLabel && <Text style={text}><strong>When:</strong> {whenLabel}</Text>}
        {location && <Text style={text}><strong>Where:</strong> {location}</Text>}
        {notes && <Text style={text}><strong>Notes:</strong> {notes}</Text>}
        <Text style={text}>
          If plans have changed, just reply to this email and we'll help sort it out — no worries either way.
        </Text>
        <Text style={footer}>With care, {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AppointmentDayOf,
  subject: (d: Record<string, any>) =>
    `Today: ${d?.title || 'your appointment'}`,
  displayName: 'Appointment reminder (day-of)',
  previewData: {
    clientName: 'Jane',
    title: 'Check-in with Dr Smith',
    whenLabel: 'Today, 10:30am',
    location: 'Perth Medical Centre',
    notes: 'Bring your latest scans.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0', textAlign: 'center' as const }
