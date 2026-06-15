/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for signing up for{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Please confirm your email address (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) by clicking the button below:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Verify Email
        </Button>
        <Text style={noticeTitle}>Not for emergencies</Text>
        <Text style={noticeText}>
          CareBridge is not a crisis service. If you or someone else is in danger, call{' '}
          <Link href="tel:000" style={link}>000</Link> or contact Lifeline on{' '}
          <Link href="tel:131114" style={link}>13 11 14</Link>.
        </Text>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 700 as const,
  color: 'hsl(210, 70%, 30%)',
  margin: '0 0 18px',
  fontFamily: 'Fraunces, Georgia, serif',
}
const text = {
  fontSize: '15px',
  color: 'hsl(210, 15%, 35%)',
  lineHeight: '1.6',
  margin: '0 0 18px',
}
const link = { color: 'hsl(200, 75%, 45%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(200, 75%, 45%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '20px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0' }
const noticeTitle = {
  fontSize: '13px',
  fontWeight: 700 as const,
  color: 'hsl(0, 65%, 45%)',
  margin: '28px 0 6px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}
const noticeText = {
  fontSize: '13px',
  color: 'hsl(210, 15%, 35%)',
  lineHeight: '1.6',
  margin: '0',
  padding: '12px 14px',
  backgroundColor: 'hsl(0, 70%, 97%)',
  border: '1px solid hsl(0, 65%, 88%)',
  borderRadius: '12px',
}
