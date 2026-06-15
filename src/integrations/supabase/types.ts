export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointment_notification_log: {
        Row: {
          appointment_id: string
          channel: string
          kind: string
          recipient_id: string
          recipient_role: string
          sent_at: string
        }
        Insert: {
          appointment_id: string
          channel: string
          kind: string
          recipient_id: string
          recipient_role: string
          sent_at?: string
        }
        Update: {
          appointment_id?: string
          channel?: string
          kind?: string
          recipient_id?: string
          recipient_role?: string
          sent_at?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          advocate_private_notes: string | null
          availability_request_id: string | null
          category: string | null
          client_id: string
          client_visible_notes: string | null
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          location: string | null
          notes: string | null
          outcome: string
          practitioner_name: string | null
          preparation_instructions: string | null
          provider_name: string | null
          starts_at: string
          title: string
          what_to_bring: string | null
        }
        Insert: {
          advocate_private_notes?: string | null
          availability_request_id?: string | null
          category?: string | null
          client_id: string
          client_visible_notes?: string | null
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          outcome?: string
          practitioner_name?: string | null
          preparation_instructions?: string | null
          provider_name?: string | null
          starts_at: string
          title: string
          what_to_bring?: string | null
        }
        Update: {
          advocate_private_notes?: string | null
          availability_request_id?: string | null
          category?: string | null
          client_id?: string
          client_visible_notes?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          outcome?: string
          practitioner_name?: string | null
          preparation_instructions?: string | null
          provider_name?: string | null
          starts_at?: string
          title?: string
          what_to_bring?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_availability_request_id_fkey"
            columns: ["availability_request_id"]
            isOneToOne: false
            referencedRelation: "availability_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      attention_signals: {
        Row: {
          auto_resolved_at: string | null
          client_id: string
          created_at: string
          id: string
          noted_at: string | null
          noted_by: string | null
          signal_type: string
          thread_id: string | null
        }
        Insert: {
          auto_resolved_at?: string | null
          client_id: string
          created_at?: string
          id?: string
          noted_at?: string | null
          noted_by?: string | null
          signal_type: string
          thread_id?: string | null
        }
        Update: {
          auto_resolved_at?: string | null
          client_id?: string
          created_at?: string
          id?: string
          noted_at?: string | null
          noted_by?: string | null
          signal_type?: string
          thread_id?: string | null
        }
        Relationships: []
      }
      availability_options: {
        Row: {
          availability_request_id: string
          created_at: string
          date: string
          end_time: string | null
          id: string
          label: string
          selected_by_client: boolean
          start_time: string | null
          time_window: string
        }
        Insert: {
          availability_request_id: string
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          label?: string
          selected_by_client?: boolean
          start_time?: string | null
          time_window: string
        }
        Update: {
          availability_request_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          label?: string
          selected_by_client?: boolean
          start_time?: string | null
          time_window?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_options_availability_request_id_fkey"
            columns: ["availability_request_id"]
            isOneToOne: false
            referencedRelation: "availability_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_requests: {
        Row: {
          advocate_id: string
          advocate_notes: string | null
          appointment_category: string
          appointment_purpose: string
          client_facing_notes: string | null
          client_id: string
          client_responded_at: string | null
          clinic_name: string | null
          created_at: string
          date_range_end: string
          date_range_start: string
          id: string
          in_person_required: boolean
          interpreter_needed: boolean
          location: string | null
          preferred_appointment_length_minutes: number | null
          provider_name: string | null
          sent_at: string | null
          status: string
          telehealth_acceptable: boolean
          transport_considerations: string | null
          updated_at: string
          urgency: string
        }
        Insert: {
          advocate_id: string
          advocate_notes?: string | null
          appointment_category: string
          appointment_purpose?: string
          client_facing_notes?: string | null
          client_id: string
          client_responded_at?: string | null
          clinic_name?: string | null
          created_at?: string
          date_range_end: string
          date_range_start: string
          id?: string
          in_person_required?: boolean
          interpreter_needed?: boolean
          location?: string | null
          preferred_appointment_length_minutes?: number | null
          provider_name?: string | null
          sent_at?: string | null
          status?: string
          telehealth_acceptable?: boolean
          transport_considerations?: string | null
          updated_at?: string
          urgency?: string
        }
        Update: {
          advocate_id?: string
          advocate_notes?: string | null
          appointment_category?: string
          appointment_purpose?: string
          client_facing_notes?: string | null
          client_id?: string
          client_responded_at?: string | null
          clinic_name?: string | null
          created_at?: string
          date_range_end?: string
          date_range_start?: string
          id?: string
          in_person_required?: boolean
          interpreter_needed?: boolean
          location?: string | null
          preferred_appointment_length_minutes?: number | null
          provider_name?: string | null
          sent_at?: string | null
          status?: string
          telehealth_acceptable?: boolean
          transport_considerations?: string | null
          updated_at?: string
          urgency?: string
        }
        Relationships: []
      }
      client_availability_preferences: {
        Row: {
          availability_request_id: string
          cannot_attend_this_week: boolean
          client_notes: string | null
          created_at: string
          flexible: boolean
          id: string
          needs_help_deciding: boolean
          needs_interpreter: boolean
          needs_transport: boolean
          prefers_after_work: boolean
          prefers_afternoon: boolean
          prefers_morning: boolean
          prefers_telehealth: boolean
          updated_at: string
        }
        Insert: {
          availability_request_id: string
          cannot_attend_this_week?: boolean
          client_notes?: string | null
          created_at?: string
          flexible?: boolean
          id?: string
          needs_help_deciding?: boolean
          needs_interpreter?: boolean
          needs_transport?: boolean
          prefers_after_work?: boolean
          prefers_afternoon?: boolean
          prefers_morning?: boolean
          prefers_telehealth?: boolean
          updated_at?: string
        }
        Update: {
          availability_request_id?: string
          cannot_attend_this_week?: boolean
          client_notes?: string | null
          created_at?: string
          flexible?: boolean
          id?: string
          needs_help_deciding?: boolean
          needs_interpreter?: boolean
          needs_transport?: boolean
          prefers_after_work?: boolean
          prefers_afternoon?: boolean
          prefers_morning?: boolean
          prefers_telehealth?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_availability_preferences_availability_request_id_fkey"
            columns: ["availability_request_id"]
            isOneToOne: true
            referencedRelation: "availability_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      client_cases: {
        Row: {
          case_status: string
          case_title: string
          client_id: string
          closed_at: string | null
          complexity_level: string | null
          created_at: string
          created_by: string
          id: string
          main_advocacy_area: string | null
          next_action: string | null
          next_action_due_at: string | null
          opened_at: string
          payment_state: string | null
          primary_goal: string | null
          service_type: string
          tier: string | null
          updated_at: string
        }
        Insert: {
          case_status?: string
          case_title: string
          client_id: string
          closed_at?: string | null
          complexity_level?: string | null
          created_at?: string
          created_by: string
          id?: string
          main_advocacy_area?: string | null
          next_action?: string | null
          next_action_due_at?: string | null
          opened_at?: string
          payment_state?: string | null
          primary_goal?: string | null
          service_type: string
          tier?: string | null
          updated_at?: string
        }
        Update: {
          case_status?: string
          case_title?: string
          client_id?: string
          closed_at?: string | null
          complexity_level?: string | null
          created_at?: string
          created_by?: string
          id?: string
          main_advocacy_area?: string | null
          next_action?: string | null
          next_action_due_at?: string | null
          opened_at?: string
          payment_state?: string | null
          primary_goal?: string | null
          service_type?: string
          tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_fee_arrangements: {
        Row: {
          client_id: string
          created_at: string
          model: Database["public"]["Enums"]["fee_model"]
          notes: string
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          model?: Database["public"]["Enums"]["fee_model"]
          notes?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          model?: Database["public"]["Enums"]["fee_model"]
          notes?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      client_internal_notes: {
        Row: {
          body: string
          client_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          client_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          client_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      client_payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          invoice_given: boolean
          invoice_given_at: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          label: string
          paid: boolean
          paid_at: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string
          id?: string
          invoice_given?: boolean
          invoice_given_at?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          label?: string
          paid?: boolean
          paid_at?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          invoice_given?: boolean
          invoice_given_at?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          label?: string
          paid?: boolean
          paid_at?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      client_report_meta: {
        Row: {
          client_id: string
          report_progress: number
          report_requested_from: string | null
          report_requested_to: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          report_progress?: number
          report_requested_from?: string | null
          report_requested_to?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          report_progress?: number
          report_requested_from?: string | null
          report_requested_to?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clinic_contact_logs: {
        Row: {
          accepts_advocate: string
          advocate_id: string
          availability_request_id: string
          clinic_name: string
          contacted_at: string
          created_at: string
          id: string
          next_action: string | null
          notes: string | null
          outcome: string
          person_spoken_to: string | null
          phone_number: string | null
          requires_authority_form: string
        }
        Insert: {
          accepts_advocate?: string
          advocate_id: string
          availability_request_id: string
          clinic_name?: string
          contacted_at?: string
          created_at?: string
          id?: string
          next_action?: string | null
          notes?: string | null
          outcome?: string
          person_spoken_to?: string | null
          phone_number?: string | null
          requires_authority_form?: string
        }
        Update: {
          accepts_advocate?: string
          advocate_id?: string
          availability_request_id?: string
          clinic_name?: string
          contacted_at?: string
          created_at?: string
          id?: string
          next_action?: string | null
          notes?: string | null
          outcome?: string
          person_spoken_to?: string | null
          phone_number?: string | null
          requires_authority_form?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_contact_logs_availability_request_id_fkey"
            columns: ["availability_request_id"]
            isOneToOne: false
            referencedRelation: "availability_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          audience: Database["public"]["Enums"]["template_audience"]
          created_at: string
          created_by: string
          description: string | null
          file_name: string | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["template_audience"]
          created_at?: string
          created_by: string
          description?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["template_audience"]
          created_at?: string
          created_by?: string
          description?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          client_id: string
          created_at: string
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string
          triaged_at: string | null
          triaged_by: string | null
          uploaded_by: string
          visibility: Database["public"]["Enums"]["document_visibility"]
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path: string
          triaged_at?: string | null
          triaged_by?: string | null
          uploaded_by: string
          visibility?: Database["public"]["Enums"]["document_visibility"]
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string
          triaged_at?: string | null
          triaged_by?: string | null
          uploaded_by?: string
          visibility?: Database["public"]["Enums"]["document_visibility"]
        }
        Relationships: []
      }
      email_change_requests: {
        Row: {
          cancelled_at: string | null
          created_at: string
          error_message: string | null
          expires_at: string
          id: string
          initiated_by: string
          initiator_role: string
          new_email: string
          old_email: string
          status: string
          token_hash: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string
          id?: string
          initiated_by: string
          initiator_role: string
          new_email: string
          old_email: string
          status?: string
          token_hash: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string
          id?: string
          initiated_by?: string
          initiator_role?: string
          new_email?: string
          old_email?: string
          status?: string
          token_hash?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emotion_logs: {
        Row: {
          created_at: string
          emotion: string
          id: string
          optional_note: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          emotion: string
          id?: string
          optional_note?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          emotion?: string
          id?: string
          optional_note?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      inbound_messages: {
        Row: {
          archived_at: string | null
          assigned_advocate: string | null
          converted_at: string | null
          converted_client_id: string | null
          created_at: string
          email: string
          enquiry_status: string
          id: string
          internal_notes: string | null
          ip_address: string | null
          last_contacted_at: string | null
          message: string
          name: string
          phone: string | null
          preferred_contact: string | null
          read_at: string | null
          service_interest: string | null
          source: string | null
          status: Database["public"]["Enums"]["inbound_message_status"]
          subject: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_advocate?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          email: string
          enquiry_status?: string
          id?: string
          internal_notes?: string | null
          ip_address?: string | null
          last_contacted_at?: string | null
          message: string
          name: string
          phone?: string | null
          preferred_contact?: string | null
          read_at?: string | null
          service_interest?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["inbound_message_status"]
          subject?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_advocate?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          email?: string
          enquiry_status?: string
          id?: string
          internal_notes?: string | null
          ip_address?: string | null
          last_contacted_at?: string | null
          message?: string
          name?: string
          phone?: string | null
          preferred_contact?: string | null
          read_at?: string | null
          service_interest?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["inbound_message_status"]
          subject?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_messages_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_notification_log: {
        Row: {
          email_number: number
          id: string
          sent_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          email_number: number
          id?: string
          sent_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          email_number?: number
          id?: string
          sent_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      message_threads: {
        Row: {
          advocate_id: string
          client_id: string
          created_at: string
          id: string
          last_message_at: string | null
        }
        Insert: {
          advocate_id: string
          client_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
        }
        Update: {
          advocate_id?: string
          client_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          sender_role: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          sender_role: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          email_on_new_message: boolean
          inapp_enabled: boolean
          push_on_new_message: boolean
          quiet_end: string
          quiet_hours_enabled: boolean
          quiet_start: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email_on_new_message?: boolean
          inapp_enabled?: boolean
          push_on_new_message?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email_on_new_message?: boolean
          inapp_enabled?: boolean
          push_on_new_message?: boolean
          quiet_end?: string
          quiet_hours_enabled?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          kind: string
          link: string | null
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
          user_role: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
          user_role: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
          user_role?: string
        }
        Relationships: []
      }
      payment_note_dismissals: {
        Row: {
          client_id: string
          dismissed_at: string
          payment_id: string
        }
        Insert: {
          client_id: string
          dismissed_at?: string
          payment_id: string
        }
        Update: {
          client_id?: string
          dismissed_at?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_note_dismissals_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "client_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders_log: {
        Row: {
          client_id: string
          id: string
          kind: string
          payment_id: string
          sent_at: string
        }
        Insert: {
          client_id: string
          id?: string
          kind: string
          payment_id: string
          sent_at?: string
        }
        Update: {
          client_id?: string
          id?: string
          kind?: string
          payment_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_log_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "client_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          bank_details: string
          currency: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_details?: string
          currency?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_details?: string
          currency?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activated_at: string | null
          client_colour: string
          client_progress: number
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_urgency_calculated_at: string | null
          lifecycle_status:
            | Database["public"]["Enums"]["client_lifecycle_status"]
            | null
          messages_banner_dismissed_at: string | null
          must_change_password: boolean
          payment_status: Database["public"]["Enums"]["client_payment_status"]
          phone: string | null
          report_status: Database["public"]["Enums"]["client_report_status"]
          tier: Database["public"]["Enums"]["client_tier"]
          updated_at: string
          urgency_level: string
          urgency_score: number
        }
        Insert: {
          activated_at?: string | null
          client_colour?: string
          client_progress?: number
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          last_urgency_calculated_at?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["client_lifecycle_status"]
            | null
          messages_banner_dismissed_at?: string | null
          must_change_password?: boolean
          payment_status?: Database["public"]["Enums"]["client_payment_status"]
          phone?: string | null
          report_status?: Database["public"]["Enums"]["client_report_status"]
          tier?: Database["public"]["Enums"]["client_tier"]
          updated_at?: string
          urgency_level?: string
          urgency_score?: number
        }
        Update: {
          activated_at?: string | null
          client_colour?: string
          client_progress?: number
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_urgency_calculated_at?: string | null
          lifecycle_status?:
            | Database["public"]["Enums"]["client_lifecycle_status"]
            | null
          messages_banner_dismissed_at?: string | null
          must_change_password?: boolean
          payment_status?: Database["public"]["Enums"]["client_payment_status"]
          phone?: string | null
          report_status?: Database["public"]["Enums"]["client_report_status"]
          tier?: Database["public"]["Enums"]["client_tier"]
          updated_at?: string
          urgency_level?: string
          urgency_score?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          is_active: boolean
          keys: Json
          last_used_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          is_active?: boolean
          keys: Json
          last_used_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          is_active?: boolean
          keys?: Json
          last_used_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      report_comments: {
        Row: {
          author_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          report_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          report_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          client_agreed_at: string | null
          client_feedback: string | null
          client_id: string
          created_at: string
          created_by: string
          file_name: string | null
          id: string
          mime_type: string | null
          shared_at: string | null
          size_bytes: number | null
          stage: Database["public"]["Enums"]["report_stage"]
          status: Database["public"]["Enums"]["report_review_status"]
          storage_path: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["report_visibility"]
        }
        Insert: {
          client_agreed_at?: string | null
          client_feedback?: string | null
          client_id: string
          created_at?: string
          created_by: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          shared_at?: string | null
          size_bytes?: number | null
          stage?: Database["public"]["Enums"]["report_stage"]
          status?: Database["public"]["Enums"]["report_review_status"]
          storage_path?: string | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["report_visibility"]
        }
        Update: {
          client_agreed_at?: string | null
          client_feedback?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          shared_at?: string | null
          size_bytes?: number | null
          stage?: Database["public"]["Enums"]["report_stage"]
          status?: Database["public"]["Enums"]["report_review_status"]
          storage_path?: string | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["report_visibility"]
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_status_events: {
        Row: {
          at: string
          client_id: string
          from_status: Database["public"]["Enums"]["task_status"] | null
          id: string
          task_id: string
          title_snapshot: string
          to_status: Database["public"]["Enums"]["task_status"]
        }
        Insert: {
          at?: string
          client_id: string
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          task_id: string
          title_snapshot: string
          to_status: Database["public"]["Enums"]["task_status"]
        }
        Update: {
          at?: string
          client_id?: string
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          task_id?: string
          title_snapshot?: string
          to_status?: Database["public"]["Enums"]["task_status"]
        }
        Relationships: []
      }
      task_subtasks: {
        Row: {
          created_at: string
          created_by: string
          done: boolean
          done_at: string | null
          id: string
          parent_task_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          done?: boolean
          done_at?: string | null
          id?: string
          parent_task_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          done?: boolean
          done_at?: string | null
          id?: string
          parent_task_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_subtasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          auto_dedup_key: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          is_priority: boolean
          reminder_at: string | null
          reminder_sent_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          time_block_end: string | null
          title: string
        }
        Insert: {
          auto_dedup_key?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_priority?: boolean
          reminder_at?: string | null
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          time_block_end?: string | null
          title: string
        }
        Update: {
          auto_dedup_key?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_priority?: boolean
          reminder_at?: string | null
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          time_block_end?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          label: string | null
          last_used_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          label?: string | null
          last_used_at?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          last_used_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _primary_advocate_id: { Args: never; Returns: string }
      admin_delete_client: { Args: { _user_id: string }; Returns: undefined }
      agree_report: { Args: { _report_id: string }; Returns: undefined }
      bump_client_progress: {
        Args: { _cap?: number; _client_id: string; _delta: number }
        Returns: number
      }
      calculate_client_urgency: {
        Args: { p_client_id: string }
        Returns: {
          level: string
          score: number
          signals: Json
        }[]
      }
      count_my_active_recovery_codes: { Args: never; Returns: number }
      create_overdue_task_reminders: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_message_thread_for_client: {
        Args: { _client_id: string }
        Returns: undefined
      }
      find_my_trusted_device: {
        Args: { _token_hash: string }
        Returns: {
          expires_at: string
          id: string
        }[]
      }
      get_advocate_dashboard_counts: { Args: never; Returns: Json }
      get_advocate_notes: { Args: { _request_id: string }; Returns: string }
      get_appointment_private_notes_map: {
        Args: never
        Returns: {
          advocate_private_notes: string
          id: string
        }[]
      }
      get_client_crm_summary: { Args: { p_client_id: string }; Returns: Json }
      get_client_emotion_summary: {
        Args: { _client_id: string; _days?: number }
        Returns: {
          count: number
          day: string
          emotion: string
        }[]
      }
      get_my_advocate: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      get_recent_low_mood_rows: {
        Args: { _days?: number }
        Returns: {
          created_at: string
          emotion: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invalidate_user_auth_tokens: {
        Args: { _user_id: string }
        Returns: undefined
      }
      list_my_trusted_devices: {
        Args: never
        Returns: {
          created_at: string
          expires_at: string
          id: string
          label: string
          last_used_at: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: { Args: { _id: string }; Returns: undefined }
      mark_thread_read: { Args: { _thread_id: string }; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      process_auto_advocate_tasks: { Args: never; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_all_active_client_urgency: { Args: never; Returns: number }
      recompute_client_progress: {
        Args: { _client_id: string }
        Returns: number
      }
      reset_report_progress: {
        Args: { _client_id: string }
        Returns: undefined
      }
      revert_report_to_draft: {
        Args: { _report_id: string }
        Returns: undefined
      }
      send_back_report: {
        Args: { _note: string; _report_id: string }
        Returns: undefined
      }
      set_report_stage_visibility: {
        Args: {
          _report_id: string
          _stage: Database["public"]["Enums"]["report_stage"]
          _visibility: Database["public"]["Enums"]["report_visibility"]
        }
        Returns: undefined
      }
      share_report_for_review: {
        Args: { _report_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "advocate" | "client"
      client_lifecycle_status:
        | "New enquiry"
        | "Invited"
        | "Invite accepted"
        | "Onboarding incomplete"
        | "Onboarding complete"
        | "Active"
        | "Waiting on client"
        | "Waiting on clinic"
        | "Appointment upcoming"
        | "Report in progress"
        | "Payment outstanding"
        | "Follow-up required"
        | "Completed"
        | "Ongoing support"
        | "Inactive"
      client_payment_status: "unpaid" | "half_paid" | "full_paid"
      client_report_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "updating"
        | "finished"
      client_tier: "tier_1" | "tier_2" | "tier_3"
      document_status: "pending_review" | "triaged" | "archived"
      document_visibility: "shared" | "advocate_private"
      fee_model: "tier_50_50" | "custom"
      inbound_message_status: "new" | "read" | "archived"
      payment_kind: "deposit" | "final" | "custom"
      report_review_status: "draft" | "shared_for_review" | "agreed"
      report_stage: "draft" | "v1" | "v2" | "v3" | "finalised" | "updated"
      report_visibility: "private" | "shared"
      task_status: "to_do" | "complete"
      template_audience: "patient" | "clinic" | "both"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["advocate", "client"],
      client_lifecycle_status: [
        "New enquiry",
        "Invited",
        "Invite accepted",
        "Onboarding incomplete",
        "Onboarding complete",
        "Active",
        "Waiting on client",
        "Waiting on clinic",
        "Appointment upcoming",
        "Report in progress",
        "Payment outstanding",
        "Follow-up required",
        "Completed",
        "Ongoing support",
        "Inactive",
      ],
      client_payment_status: ["unpaid", "half_paid", "full_paid"],
      client_report_status: [
        "not_started",
        "in_progress",
        "completed",
        "updating",
        "finished",
      ],
      client_tier: ["tier_1", "tier_2", "tier_3"],
      document_status: ["pending_review", "triaged", "archived"],
      document_visibility: ["shared", "advocate_private"],
      fee_model: ["tier_50_50", "custom"],
      inbound_message_status: ["new", "read", "archived"],
      payment_kind: ["deposit", "final", "custom"],
      report_review_status: ["draft", "shared_for_review", "agreed"],
      report_stage: ["draft", "v1", "v2", "v3", "finalised", "updated"],
      report_visibility: ["private", "shared"],
      task_status: ["to_do", "complete"],
      template_audience: ["patient", "clinic", "both"],
    },
  },
} as const
