/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'CareBridge Perth'

interface Props {
  clientName?: string
  fileName?: string
  downloadUrl?: string
  uploadedAt?: string
}

const DocumentUploadAlert = ({ clientName, fileName, downloadUrl, uploadedAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{clientName ? `${clientName} just uploaded a document` : 'A client just uploaded a document'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New document uploaded</Heading>
        <Text style={text}>
          {clientName ? <strong>{clientName}</strong> : 'A client'} just shared a new document
          {fileName ? <> — <strong>{fileName}</strong></> : ''}
          {uploadedAt ? ` at ${uploadedAt}` : ''}.
        </Text>
        <Text style={text}>
          Click below to download it straight to your computer and move it to your Secure Space.
        </Text>
        {downloadUrl && (
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button href={downloadUrl} style={button}>Download document</Button>
          </Section>
        )}
        <Text style={footer}>{SITE_NAME} — advocate alert</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DocumentUploadAlert,
  subject: (d: Record<string, any>) =>
    `New document from ${d?.clientName || 'a client'} — review & download`,
  displayName: 'Document upload alert',
  to: 'hello@carebridgeperth.com',
  previewData: {
    clientName: 'Jane Doe',
    fileName: 'scan-2026-05-16.pdf',
    downloadUrl: 'https://example.com/download',
    uploadedAt: 'today, 10:24',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 700, color: 'hsl(210, 70%, 30%)', margin: '0 0 18px', fontFamily: 'Fraunces, Georgia, serif' }
const text = { fontSize: '15px', color: 'hsl(210, 15%, 35%)', lineHeight: '1.6', margin: '0 0 14px' }
const button = {
  backgroundColor: 'hsl(200, 75%, 45%)',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '20px',
  fontWeight: 600,
  fontSize: '15px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(210, 15%, 55%)', margin: '32px 0 0', textAlign: 'center' as const }
