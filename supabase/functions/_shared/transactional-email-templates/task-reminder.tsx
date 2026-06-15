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
  dueLabel?: string
  description?: string
}

const TaskReminder = ({ clientName, title, dueLabel, description }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reminder: {title || 'a task'} is due {dueLabel || 'soon'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{clientName ? `Hi ${clientName},` : 'Hi there,'}</Heading>
        <Text style={text}>
          Just a gentle reminder about a task on your list.
        </Text>
        {title && <Text style={text}><strong>Task:</strong> {title}</Text>}
        {dueLabel && <Text style={text}><strong>Due:</strong> {dueLabel}</Text>}
        {description && <Text style={text}><strong>Notes:</strong> {description}</Text>}
        <Text style={text}>
          You can mark it complete any time from your CareBridge dashboard. No pressure — just here if it helps.
        </Text>
        <Text style={footer}>With care, {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskReminder,
  subject: (d: Record<string, any>) =>
    `Reminder: ${d?.title || 'your task'} due ${d?.dueLabel || 'soon'}`,
  displayName: 'Task reminder',
  previewData: {
    clientName: 'Jane',
    title: 'Send referral letter',
    dueLabel: 'Tomorrow',
    description: 'GP requested by Friday.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 12px' }
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0', textAlign: 'center' as const }
