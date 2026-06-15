/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'
const NAVY = '#1C2B3A'
const SAGE = '#8BA888'
const MUTED = '#55636F'

interface Props {
  recipientName?: string
  senderName?: string
  isFollowUp?: boolean
  messagesUrl?: string
}

const NewMessageNotification = ({
  recipientName,
  senderName,
  isFollowUp,
  messagesUrl,
}: Props) => {
  const url = messagesUrl || 'https://www.client.carebridgeperth.com/messages'
  const who = senderName || 'someone in CareBridge'
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,'
  const preview = isFollowUp
    ? `Just a soft reminder — you have an unread message from ${who}.`
    : `You have a new message from ${who} in CareBridge.`
  const line = isFollowUp
    ? `Just a soft reminder — ${who} sent you a message in CareBridge that's still waiting whenever you're ready.`
    : `${who} sent you a message in CareBridge. No rush — open it whenever works for you.`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{greeting}</Heading>
          <Text style={text}>{line}</Text>
          <Button href={url} style={button}>Open your messages</Button>
          <Text style={footnote}>
            For your privacy, we never include the message itself in this email.
          </Text>
          <Text style={signoff}>Warmly, the {SITE_NAME} team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: NewMessageNotification,
  subject: (data: Record<string, any>) => {
    const who = data?.senderName || 'your CareBridge contact'
    return data?.isFollowUp
      ? `A gentle reminder — message from ${who}`
      : `A message from ${who}`
  },
  displayName: 'New message notification',
  previewData: {
    recipientName: 'Sam',
    senderName: 'Antonella',
    isFollowUp: false,
    messagesUrl: 'https://www.client.carebridgeperth.com/messages',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif', color: NAVY }
const container = { padding: '28px 32px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: NAVY, margin: '0 0 16px' }
const text = { fontSize: '15px', lineHeight: '1.6', color: NAVY, margin: '0 0 20px' }
const button = { backgroundColor: SAGE, color: '#ffffff', padding: '12px 22px', borderRadius: '10px', textDecoration: 'none', fontWeight: 600, fontSize: '15px', display: 'inline-block' }
const footnote = { fontSize: '13px', color: MUTED, margin: '20px 0 0' }
const signoff = { fontSize: '14px', color: NAVY, margin: '24px 0 0' }
