export type IntakeContactMethod = "app" | "email" | "phone" | "sms";

export type ClientIntakeRecord = {
  // Section 1 — Personal Details
  full_name: string;
  preferred_name: string;
  date_of_birth: string; // YYYY-MM-DD
  gender: string;
  pronouns: string;
  mobile_phone: string;
  email: string;
  residential_address: string;
  suburb: string;
  postcode: string;
  state: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;

  // Section 2 — Treating Doctors
  gp_name: string;
  gp_clinic: string;
  gp_phone: string;
  gp_email: string;
  specialists: string;

  // Section 3 — Reason for engaging
  services_interested: string[];
  help_needed: string;
  main_outcome: string;

  // Section 4 — Health concerns
  main_concerns: string;
  concerns_onset: string;

  // Section 5 — Medical history
  diagnosed_conditions: string;
  current_medications: string;
  allergies: string;
  recent_investigations: string;

  // Section 6 — Administrative
  referral_source: string;
  preferred_contact_method: IntakeContactMethod | "";
  other_info: string;

  // Meta
  submitted_at?: string | null;
};

export const INTAKE_SERVICES = [
  "GP Consultation Prep",
  "Evidence-Based Case Review",
  "Complex Case Support",
  "Post-GP Follow-Up",
  "Ongoing Coordination",
] as const;

export const INTAKE_CONTACT_METHODS: { value: IntakeContactMethod; label: string }[] = [
  { value: "app", label: "App" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
];

export const EMPTY_INTAKE: ClientIntakeRecord = {
  full_name: "",
  preferred_name: "",
  date_of_birth: "",
  gender: "",
  pronouns: "",
  mobile_phone: "",
  email: "",
  residential_address: "",
  suburb: "",
  postcode: "",
  state: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
  gp_name: "",
  gp_clinic: "",
  gp_phone: "",
  gp_email: "",
  specialists: "",
  services_interested: [],
  help_needed: "",
  main_outcome: "",
  main_concerns: "",
  concerns_onset: "",
  diagnosed_conditions: "",
  current_medications: "",
  allergies: "",
  recent_investigations: "",
  referral_source: "",
  preferred_contact_method: "",
  other_info: "",
};
