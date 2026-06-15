/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'

interface Props {
  clientName?: string
  whenLabel?: string
  clinicName?: string | null
  providerName?: string | null
  practitionerName?: string | null
  location?: string | null
  advocatePrivateNotes?: string | null
  reviewUrl?: string | null
}

const Appointment4hReminderAdvocate = ({
  clientName, whenLabel, clinicName, providerName, practitionerName,
  location, advocatePrivateNotes, reviewUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Client appointment in about 4 hours{clientName ? ` — ${clientName}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Client appointment today</Heading>
        <Text style={text}>Your client's appointment is coming up in about 4 hours.</Text>
        {clientName && <Text style={text}><strong>Client:</strong> {clientName}</Text>}
        {whenLabel && <Text style={text}><strong>When:</strong> {whenLabel}</Text>}
        {clinicName && <Text style={text}><strong>Clinic:</strong> {clinicName}</Text>}
        {providerName && <Text style={text}><strong>Provider:</strong> {providerName}</Text>}
        {practitionerName && <Text style={text}><strong>Practitioner:</strong> {practitionerName}</Text>}
        {location && <Text style={text}><strong>Where:</strong> {location}</Text>}
        {advocatePrivateNotes && <Text style={text}><strong>Private notes:</strong> {advocatePrivateNotes}</Text>}
        {reviewUrl && <Text style={text}><Link href={reviewUrl} style={link}>Open appointment details</Link></Text>}
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Appointment4hReminderAdvocate,
  subject: 'Reminder: client appointment in 4 hours',
  displayName: 'Appointment 4h reminder (advocate)',
  previewData: { clientName: 'Jane Doe', whenLabel: 'Today, 2:30pm' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const link = { color: 'hsl(195, 60%, 38%)', textDecoration: 'underline' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0', textAlign: 'center' as const }
