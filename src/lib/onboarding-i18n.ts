export type Lang = "en" | "es" | "pt";

export const LANG_STORAGE_KEY = "carebridge.onboarding.lang";

export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

type Dict = {
  language: string;
  back: string;
  continue: string;
  step: (n: number, total: number) => string;
  // Screen 1
  s1_heading: string;
  s1_body: string;
  s1_choose: string;
  // Screen 2
  s2_heading: string;
  s2_bullets: string[];
  s2_ack: string;
  // Screen 3
  s3_heading: string;
  s3_bullets: string[];
  s3_privacyLink: string;
  s3_consent: string;
  // Screen 4
  s4_heading: string;
  s4_note: string;
  s4_preferredName: string;
  s4_preferredNamePh: string;
  s4_preferredLang: string;
  s4_preferredContact: string;
  s4_contact_app: string;
  s4_contact_email: string;
  s4_contact_phone: string;
  // Screen 5
  s5_heading: string;
  s5_intro: string;
  s5_docs_t: string;
  s5_docs_b: string;
  s5_msg_t: string;
  s5_msg_b: string;
  s5_cal_t: string;
  s5_cal_b: string;
  // Screen 6
  s6_heading: string;
  s6_body: string;
  s6_cta: string;
};

export const DICT: Record<Lang, Dict> = {
  en: {
    language: "Language",
    back: "Back",
    continue: "Continue",
    step: (n, total) => `Step ${n} of ${total}`,
    s1_heading: "Welcome to CareBridge",
    s1_body:
      "We're here to help you understand and navigate your care — one step at a time.",
    s1_choose: "Choose your language",
    s2_heading: "Before we begin",
    s2_bullets: [
      "We're a health navigation and advocacy service — not a medical or clinical service.",
      "We don't give medical advice, diagnosis, or treatment, and we don't replace your doctor.",
      "We help you understand, organise, and advocate for your care — you stay in control of every decision.",
      "In an emergency, always call 000.",
    ],
    s2_ack:
      "I understand that CareBridge provides non-clinical health navigation and advocacy, does not provide medical advice or treatment, and does not replace my doctor or treating team. I understand that in an emergency I should call 000.",
    s3_heading: "Your information is safe with you",
    s3_bullets: [
      "Your health information is stored securely, here in Australia.",
      "Only you and your CareBridge advocate can see it.",
      "You can ask to view, correct, or remove your information at any time.",
    ],
    s3_privacyLink: "Read our full Privacy Notice",
    s3_consent:
      "I consent to CareBridge collecting and securely storing my information to help with my care.",
    s4_heading: "Tell us a little about you",
    s4_note: "You can add more later — no rush.",
    s4_preferredName: "Preferred name",
    s4_preferredNamePh: "What should we call you?",
    s4_preferredLang: "Preferred language",
    s4_preferredContact: "Preferred way to reach you",
    s4_contact_app: "In the app",
    s4_contact_email: "Email",
    s4_contact_phone: "Phone",
    s5_heading: "How CareBridge works",
    s5_intro: "Three calm places to find what you need.",
    s5_docs_t: "Documents",
    s5_docs_b: "Share and organise your paperwork.",
    s5_msg_t: "Messages",
    s5_msg_b: "Talk with your advocate.",
    s5_cal_t: "Calendar",
    s5_cal_b: "Keep track of appointments.",
    s6_heading: "You're all set 🌊",
    s6_body: "Take it one step at a time — we've got the rest.",
    s6_cta: "Enter my space",
  },
  es: {
    language: "Idioma",
    back: "Atrás",
    continue: "Continuar",
    step: (n, total) => `Paso ${n} de ${total}`,
    s1_heading: "Bienvenida/o a CareBridge",
    s1_body:
      "Estamos aquí para ayudarte a entender y navegar tu atención — paso a paso.",
    s1_choose: "Elige tu idioma",
    s2_heading: "Antes de comenzar",
    s2_bullets: [
      "Somos un servicio de navegación de salud y advocacy — no un servicio médico o clínico.",
      "No damos consejo médico, diagnóstico ni tratamiento, y no reemplazamos a tu médico.",
      "Te ayudamos a entender, organizar y abogar por tu atención — tú mantienes el control de cada decisión.",
      "En una emergencia, siempre llama al 000.",
    ],
    s2_ack:
      "Entiendo que CareBridge ofrece navegación de salud y advocacy no clínicos, que no brinda consejo médico ni tratamiento, y que no reemplaza a mi médico ni a mi equipo tratante. Entiendo que en una emergencia debo llamar al 000.",
    s3_heading: "Tu información está segura contigo",
    s3_bullets: [
      "Tu información de salud se guarda de forma segura, aquí en Australia.",
      "Solo tú y tu defensor/a de CareBridge pueden verla.",
      "Puedes pedir ver, corregir o eliminar tu información en cualquier momento.",
    ],
    s3_privacyLink: "Lee nuestro Aviso de Privacidad completo",
    s3_consent:
      "Doy mi consentimiento para que CareBridge recopile y guarde de forma segura mi información para ayudar con mi atención.",
    s4_heading: "Cuéntanos un poco sobre ti",
    s4_note: "Puedes agregar más después — sin prisa.",
    s4_preferredName: "Nombre preferido",
    s4_preferredNamePh: "¿Cómo te gustaría que te llamemos?",
    s4_preferredLang: "Idioma preferido",
    s4_preferredContact: "Forma preferida de contacto",
    s4_contact_app: "En la app",
    s4_contact_email: "Correo",
    s4_contact_phone: "Teléfono",
    s5_heading: "Cómo funciona CareBridge",
    s5_intro: "Tres espacios tranquilos para encontrar lo que necesitas.",
    s5_docs_t: "Documentos",
    s5_docs_b: "Comparte y organiza tus papeles.",
    s5_msg_t: "Mensajes",
    s5_msg_b: "Habla con tu defensor/a.",
    s5_cal_t: "Calendario",
    s5_cal_b: "Lleva el control de tus citas.",
    s6_heading: "Todo listo 🌊",
    s6_body: "Tómalo paso a paso — nosotros nos encargamos del resto.",
    s6_cta: "Entrar a mi espacio",
  },
  pt: {
    language: "Idioma",
    back: "Voltar",
    continue: "Continuar",
    step: (n, total) => `Passo ${n} de ${total}`,
    s1_heading: "Bem-vinda/o ao CareBridge",
    s1_body:
      "Estamos aqui para te ajudar a entender e navegar pelo seu cuidado — um passo de cada vez.",
    s1_choose: "Escolha o seu idioma",
    s2_heading: "Antes de começar",
    s2_bullets: [
      "Somos um serviço de navegação em saúde e advocacy — não um serviço médico ou clínico.",
      "Não damos conselho médico, diagnóstico ou tratamento, e não substituímos o seu médico.",
      "Ajudamos você a entender, organizar e defender o seu cuidado — você mantém o controle de cada decisão.",
      "Em uma emergência, ligue sempre para 000.",
    ],
    s2_ack:
      "Entendo que o CareBridge oferece navegação em saúde e advocacy não clínicos, não fornece conselho médico nem tratamento, e não substitui o meu médico ou equipe de tratamento. Entendo que, em uma emergência, devo ligar para 000.",
    s3_heading: "A sua informação está segura com você",
    s3_bullets: [
      "As suas informações de saúde são armazenadas com segurança, aqui na Austrália.",
      "Somente você e o seu defensor/a do CareBridge podem vê-las.",
      "Você pode pedir para ver, corrigir ou remover as suas informações a qualquer momento.",
    ],
    s3_privacyLink: "Leia o nosso Aviso de Privacidade completo",
    s3_consent:
      "Eu consinto que o CareBridge colete e armazene com segurança as minhas informações para ajudar no meu cuidado.",
    s4_heading: "Conte-nos um pouco sobre você",
    s4_note: "Você pode adicionar mais depois — sem pressa.",
    s4_preferredName: "Nome preferido",
    s4_preferredNamePh: "Como gostaria de ser chamado/a?",
    s4_preferredLang: "Idioma preferido",
    s4_preferredContact: "Forma preferida de contato",
    s4_contact_app: "No aplicativo",
    s4_contact_email: "E-mail",
    s4_contact_phone: "Telefone",
    s5_heading: "Como o CareBridge funciona",
    s5_intro: "Três espaços calmos para encontrar o que você precisa.",
    s5_docs_t: "Documentos",
    s5_docs_b: "Compartilhe e organize os seus papéis.",
    s5_msg_t: "Mensagens",
    s5_msg_b: "Converse com o seu defensor/a.",
    s5_cal_t: "Calendário",
    s5_cal_b: "Acompanhe os seus compromissos.",
    s6_heading: "Está tudo pronto 🌊",
    s6_body: "Vá um passo de cada vez — nós cuidamos do resto.",
    s6_cta: "Entrar no meu espaço",
  },
};

export function loadLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(LANG_STORAGE_KEY);
  return v === "es" || v === "pt" ? v : "en";
}

export function saveLang(l: Lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
}
