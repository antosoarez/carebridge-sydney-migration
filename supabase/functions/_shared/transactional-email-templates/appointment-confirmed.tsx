/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'

interface Props {
  clientName?: string
  whenLabel?: string
  clinicName?: string | null
  providerName?: string | null
  practitionerName?: string | null
  location?: string | null
  mode?: string | null
  preparationInstructions?: string | null
  whatToBring?: string | null
  clientVisibleNotes?: string | null
}

const AppointmentConfirmed = ({
  clientName, whenLabel, clinicName, providerName, practitionerName,
  location, mode, preparationInstructions, whatToBring, clientVisibleNotes,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your appointment is confirmed{whenLabel ? ` — ${whenLabel}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{clientName ? `Hi ${clientName} 🌊` : 'Hi there 🌊'}</Heading>
        <Text style={text}>Your appointment is confirmed. Here are the details — no rush, this is just for your records.</Text>
        {whenLabel && <Text style={text}><strong>When:</strong> {whenLabel}</Text>}
        {clinicName && <Text style={text}><strong>Clinic:</strong> {clinicName}</Text>}
        {providerName && <Text style={text}><strong>Provider:</strong> {providerName}</Text>}
        {practitionerName && <Text style={text}><strong>Practitioner:</strong> {practitionerName}</Text>}
        {location && <Text style={text}><strong>Where:</strong> {location}</Text>}
        {mode && <Text style={text}><strong>How:</strong> {mode}</Text>}
        {preparationInstructions && <Text style={text}><strong>How to prepare:</strong> {preparationInstructions}</Text>}
        {whatToBring && <Text style={text}><strong>What to bring:</strong> {whatToBring}</Text>}
        {clientVisibleNotes && <Text style={text}><strong>Notes:</strong> {clientVisibleNotes}</Text>}
        <Text style={text}>You can view the full details in your calendar any time. We'll send a gentle reminder closer to the date.</Text>
        <Text style={footer}>With care, {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AppointmentConfirmed,
  subject: 'Your CareBridge appointment is confirmed',
  displayName: 'Appointment confirmed (client)',
  previewData: {
    clientName: 'Jane', whenLabel: 'Tue 9 Jun, 10:30am',
    clinicName: 'Perth Medical Centre', providerName: 'Dr Smith',
    location: 'Level 2, 100 St Georges Tce', mode: 'In-person',
    preparationInstructions: 'Fast from midnight.', whatToBring: 'Medicare card, scans.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0', textAlign: 'center' as const }
