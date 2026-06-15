export interface SubtaskTemplate {
  id: string;
  title: string;
  /** Sub-task titles in order. Empty array = "start from scratch". */
  items: string[];
  /** Optional one-line hint shown under the template title in the picker. */
  hint?: string;
}

/**
 * Advocate-side templates — the advocate's work on a client's behalf.
 * Shown ONLY on the patient profile (AdvocateClientDetail). Never to clients.
 */
export const ADVOCATE_TEMPLATES: SubtaskTemplate[] = [
  {
    id: "adv-book-gp",
    title: "Book a GP appointment for a client",
    items: [
      "Find the clinic's phone number",
      "Call to book",
      "Write down date, time, and address",
      "Add to client's calendar",
    ],
  },
  {
    id: "adv-reschedule",
    title: "Reschedule a client's appointment",
    items: [
      "Call the clinic",
      "Confirm new date and time",
      "Update calendar",
      "Inform client",
    ],
  },
  {
    id: "adv-referral",
    title: "Follow up on a referral",
    items: [
      "Find who to contact",
      "Call or email",
      "Note the response",
      "Schedule the next step",
    ],
  },
  {
    id: "adv-pathology",
    title: "Book a blood test / pathology",
    items: [
      "Confirm the request form is ready",
      "Note any fasting or prep requirements",
      "Find nearest collection centre",
      "Add to client's calendar",
    ],
  },
  {
    id: "adv-scan",
    title: "Book a scan (Ultrasound / CT / MRI / X-ray)",
    items: [
      "Confirm referral is ready",
      "Call to book",
      "Note prep instructions",
      "Add to client's calendar",
    ],
  },
  {
    id: "adv-specialist-prep",
    title: "Prepare a client for a specialist appointment",
    items: [
      "Gather all documentation requested by the specialist",
      "Identify any missing documents",
      "Request missing documents from the client or GP (note who you contacted)",
      "Once all gathered, book the appointment",
      "Send the client the date, location, and prep instructions",
    ],
  },
  {
    id: "adv-report",
    title: "Report (full medical-history report)",
    items: [
      "Initial conversation — listen to client's history and concerns",
      "Identify documents needed (past results, GP records, specialist letters, imaging, medication list)",
      "Request missing documents from client, GP, or clinics",
      "Gather and organise received documents",
      "Investigate and review — read records, identify gaps, cross-reference",
      "Note any unresolved questions for the client or specialists",
      "Outline report structure",
      "Write first draft",
      "Review draft for accuracy and clarity",
      "Share draft with client for review",
      "Incorporate client feedback",
      "Finalise report",
      "Mark as agreed once the client confirms",
    ],
  },
  {
    id: "adv-blank",
    title: "Start from scratch (empty)",
    items: [],
    hint: "Add your own steps",
  },
];

/**
 * Client-side templates — things the client genuinely does themselves.
 * Shown on the client's own to-do view.
 */
export const CLIENT_TEMPLATES: SubtaskTemplate[] = [
  {
    id: "cli-specialist-prep",
    title: "Prepare for your specialist visit",
    items: [
      "Write down your symptoms",
      "Gather your past test results",
      "List the questions you want to ask",
      "Bring your referral and ID",
    ],
  },
  {
    id: "cli-attend",
    title: "Attend an appointment",
    items: [
      "Note address and parking",
      "Travel",
      "Attend",
      "Write down what was discussed",
    ],
  },
  {
    id: "cli-upload",
    title: "Upload a document",
    items: [
      "Find the document",
      "Scan or photograph it",
      "Upload it",
    ],
  },
  {
    id: "cli-blank",
    title: "Start from scratch (empty)",
    items: [],
    hint: "Add your own steps",
  },
];

/** Gentle encouragement messages shown occasionally when ticking a sub-task. */
export const SUBTASK_ENCOURAGEMENTS = [
  "One less thing 🌊",
  "Small wins add up.",
  "Nice — that's progress.",
  "Calm and steady 🌿",
];
