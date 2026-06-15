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
  clinicName?: string | null
  providerName?: string | null
  practitionerName?: string | null
  preparationInstructions?: string | null
  whatToBring?: string | null
}

const AppointmentReminder = ({
  clientName, title, whenLabel, location, notes,
  clinicName, providerName, practitionerName,
  preparationInstructions, whatToBring,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reminder: {title || 'your appointment'} tomorrow{whenLabel ? ` — ${whenLabel}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{clientName ? `Hi ${clientName},` : 'Hi there,'}</Heading>
        <Text style={text}>
          Just a gentle reminder that you have an appointment coming up in about 24 hours.
        </Text>
        {title && <Text style={text}><strong>What:</strong> {title}</Text>}
        {whenLabel && <Text style={text}><strong>When:</strong> {whenLabel}</Text>}
        {clinicName && <Text style={text}><strong>Clinic:</strong> {clinicName}</Text>}
        {providerName && <Text style={text}><strong>Provider:</strong> {providerName}</Text>}
        {practitionerName && <Text style={text}><strong>Practitioner:</strong> {practitionerName}</Text>}
        {location && <Text style={text}><strong>Where:</strong> {location}</Text>}
        {preparationInstructions && <Text style={text}><strong>How to prepare:</strong> {preparationInstructions}</Text>}
        {whatToBring && <Text style={text}><strong>What to bring:</strong> {whatToBring}</Text>}
        {notes && <Text style={text}><strong>Notes:</strong> {notes}</Text>}
        <Text style={text}>
          If anything's changed or you need to reschedule, just reply to this email and we'll sort it out.
        </Text>
        <Text style={footer}>With care, {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AppointmentReminder,
  subject: (d: Record<string, any>) =>
    `Reminder: ${d?.title || 'your appointment'} tomorrow`,
  displayName: 'Appointment reminder (24h)',
  previewData: {
    clientName: 'Jane',
    title: 'Check-in with Dr Smith',
    whenLabel: 'Tomorrow, 10:30am',
    location: 'Perth Medical Centre',
    notes: 'Bring your latest scans.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0', textAlign: 'center' as const }
