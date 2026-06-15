import type { Lang } from "@/lib/onboarding-i18n";

type IntakeDict = {
  pageTitle: string;
  heading: string;
  reassurance: string;
  helpWithLabel: string;
  helpWithPh: string;
  whatsGoingOnLabel: string;
  whatsGoingOnPh: string;
  stepsLabel: string;
  stepsHint: string;
  step_gp: string;
  step_referral: string;
  step_appointment: string;
  stepsNotesLabel: string;
  stepsNotesPh: string;
  mattersMostLabel: string;
  mattersMostPh: string;
  privacyNote: string;
  skip: string;
  submit: string;
  saved: string;
  savedDesc: string;
  skipDesc: string;
  errorTitle: string;
};

export const INTAKE_DICT: Record<Lang, IntakeDict> = {
  en: {
    pageTitle: "What would you like help with?",
    heading: "What would you like help with?",
    reassurance:
      "In your own words — there's no wrong answer, and you can skip and do this later with your advocate.",
    helpWithLabel: "What would you like CareBridge to help you with?",
    helpWithPh: "A few words is plenty…",
    whatsGoingOnLabel: "What's going on right now, in your own words?",
    whatsGoingOnPh: "Whatever feels useful to share.",
    stepsLabel: "Have you already taken any steps?",
    stepsHint: "Tick any that apply — all optional.",
    step_gp: "Contacted my GP or clinic",
    step_referral: "Got a referral",
    step_appointment: "Have an appointment booked",
    stepsNotesLabel: "Anything else about steps you've taken?",
    stepsNotesPh: "Optional notes.",
    mattersMostLabel: "What matters most to you right now?",
    mattersMostPh: "Anything that helps us focus on what you need.",
    privacyNote:
      "Only you and your CareBridge advocate can see this. You can update or remove it any time.",
    skip: "Skip for now",
    submit: "Share with my advocate",
    saved: "Thank you for sharing 🌊",
    savedDesc: "Your advocate will see this.",
    skipDesc: "No problem — you can add this later.",
    errorTitle: "Couldn't save",
  },
  es: {
    pageTitle: "¿Con qué te gustaría que te ayudemos?",
    heading: "¿Con qué te gustaría que te ayudemos?",
    reassurance:
      "Con tus propias palabras — no hay respuesta incorrecta, y puedes saltarlo y hacerlo después con tu defensor/a.",
    helpWithLabel: "¿Con qué te gustaría que CareBridge te ayude?",
    helpWithPh: "Unas pocas palabras son suficientes…",
    whatsGoingOnLabel: "¿Qué está pasando ahora mismo, en tus propias palabras?",
    whatsGoingOnPh: "Lo que sientas útil compartir.",
    stepsLabel: "¿Ya has dado algún paso?",
    stepsHint: "Marca lo que corresponda — todo es opcional.",
    step_gp: "Contacté a mi médico/a o clínica",
    step_referral: "Tengo una derivación",
    step_appointment: "Tengo una cita reservada",
    stepsNotesLabel: "¿Algo más sobre los pasos que has dado?",
    stepsNotesPh: "Notas opcionales.",
    mattersMostLabel: "¿Qué es lo más importante para ti ahora mismo?",
    mattersMostPh: "Cualquier cosa que nos ayude a enfocarnos en lo que necesitas.",
    privacyNote:
      "Solo tú y tu defensor/a de CareBridge pueden ver esto. Puedes actualizarlo o eliminarlo cuando quieras.",
    skip: "Saltar por ahora",
    submit: "Compartir con mi defensor/a",
    saved: "Gracias por compartir 🌊",
    savedDesc: "Tu defensor/a podrá verlo.",
    skipDesc: "Sin problema — puedes agregarlo después.",
    errorTitle: "No se pudo guardar",
  },
  pt: {
    pageTitle: "Com o que você gostaria de ajuda?",
    heading: "Com o que você gostaria de ajuda?",
    reassurance:
      "Com as suas próprias palavras — não há resposta errada, e você pode pular e fazer isto depois com o seu defensor/a.",
    helpWithLabel: "Com o que você gostaria que o CareBridge ajudasse?",
    helpWithPh: "Algumas palavras já bastam…",
    whatsGoingOnLabel: "O que está acontecendo agora, nas suas próprias palavras?",
    whatsGoingOnPh: "O que você sentir útil compartilhar.",
    stepsLabel: "Você já deu algum passo?",
    stepsHint: "Marque o que se aplica — tudo opcional.",
    step_gp: "Entrei em contato com o meu médico/a ou clínica",
    step_referral: "Tenho um encaminhamento",
    step_appointment: "Tenho uma consulta marcada",
    stepsNotesLabel: "Mais alguma coisa sobre os passos que você deu?",
    stepsNotesPh: "Observações opcionais.",
    mattersMostLabel: "O que é mais importante para você agora?",
    mattersMostPh: "Qualquer coisa que nos ajude a focar no que você precisa.",
    privacyNote:
      "Somente você e o seu defensor/a do CareBridge podem ver isto. Você pode atualizar ou remover a qualquer momento.",
    skip: "Pular por enquanto",
    submit: "Compartilhar com o meu defensor/a",
    saved: "Obrigado por compartilhar 🌊",
    savedDesc: "O seu defensor/a poderá ver isto.",
    skipDesc: "Sem problema — você pode adicionar depois.",
    errorTitle: "Não foi possível salvar",
  },
};
