/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as documentUploadAlert } from './document-upload-alert.tsx'
import { template as appointmentReminder } from './appointment-reminder.tsx'
import { template as appointmentDayOf } from './appointment-day-of.tsx'
import { template as supportRequest } from './support-request.tsx'
import { template as taskReminder } from './task-reminder.tsx'
import { template as paymentReminder } from './payment-reminder.tsx'
import { template as newMessageNotification } from './new-message-notification.tsx'
import { template as appointmentConfirmed } from './appointment-confirmed.tsx'
import { template as appointmentConfirmedAdvocate } from './appointment-confirmed-advocate.tsx'
import { template as appointment4hReminder } from './appointment-4h-reminder.tsx'
import { template as appointmentReminderAdvocate } from './appointment-reminder-advocate.tsx'
import { template as appointment4hReminderAdvocate } from './appointment-4h-reminder-advocate.tsx'
import { template as newEnquiryNotification } from './new-enquiry-notification.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'document-upload-alert': documentUploadAlert,
  'appointment-reminder': appointmentReminder,
  'appointment-day-of': appointmentDayOf,
  'support-request': supportRequest,
  'task-reminder': taskReminder,
  'payment-reminder': paymentReminder,
  'new-message-notification': newMessageNotification,
  'appointment-confirmed': appointmentConfirmed,
  'appointment-confirmed-advocate': appointmentConfirmedAdvocate,
  'appointment-4h-reminder': appointment4hReminder,
  'appointment-reminder-advocate': appointmentReminderAdvocate,
  'appointment-4h-reminder-advocate': appointment4hReminderAdvocate,
  'new-enquiry-notification': newEnquiryNotification,
}
