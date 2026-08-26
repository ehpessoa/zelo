/**
 * Tipos centrais do domínio do app.
 * Mantidos em um único módulo para evitar dependências circulares
 * entre os serviços de visão, contatos e integração com Alexa.
 */

// ----------------------------------------------------------------------------
// VISÃO COMPUTACIONAL
// ----------------------------------------------------------------------------

/** Ponto 2D/3D normalizado retornado pelo modelo de pose (0..1 em x/y, z relativo). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** Subconjunto de landmarks do MoveNet/BlazePose usados nas heurísticas do MVP. */
export type PoseLandmarkKey =
  | 'nose'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle';

export type PoseLandmarks = Record<PoseLandmarkKey, Landmark>;

/** Classificação postural derivada do ângulo tronco-quadril-joelho. */
export type PostureState = 'EM_PE' | 'SENTADO' | 'DEITADO' | 'DESCONHECIDO';

/** Classificação de movimentação com base na variância de posição ao longo do tempo. */
export type MovementState = 'ESTATICO' | 'INQUIETO' | 'DESCONHECIDO';

/** Emoções básicas estimadas via geometria da face mesh (razões labiais/oculares). */
export type EmotionState = 'NEUTRO' | 'ALEGRIA' | 'SURPRESA' | 'TRISTEZA' | 'DESCONHECIDO';

/** Nível de severidade de um alerta de segurança. */
export type AlertLevel = 'NENHUM' | 'ATENCAO' | 'EMERGENCIA';

/** Snapshot consolidado produzido a cada frame processado pelo pipeline. */
export interface VisionFrameResult {
  timestampMs: number;
  fps: number;
  posture: PostureState;
  movement: MovementState;
  emotion: EmotionState;
  fallDetected: boolean;
  fallSustainedMs: number;
  alertLevel: AlertLevel;
}

// ----------------------------------------------------------------------------
// CONTATOS
// ----------------------------------------------------------------------------

export type ContactRelation =
  | 'FAMILIAR'
  | 'CONJUGE'
  | 'FILHO_FILHA'
  | 'CUIDADOR'
  | 'AMIGO'
  | 'MEDICO'
  | 'OUTRO';

export interface EmergencyContact {
  id: string;
  name: string;
  ddi: string; // Ex: "55"
  ddd: string; // Ex: "11"
  phoneNumber: string; // Somente dígitos, sem DDI/DDD
  relation: ContactRelation;
  isPrimaryEmergencyContact: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Retorna o telefone completo em formato E.164 sem o "+" (ex: 5511999999999). */
export function toFullPhone(contact: Pick<EmergencyContact, 'ddi' | 'ddd' | 'phoneNumber'>): string {
  const digitsOnly = (value: string) => value.replace(/\D/g, '');
  return `${digitsOnly(contact.ddi)}${digitsOnly(contact.ddd)}${digitsOnly(contact.phoneNumber)}`;
}

// ----------------------------------------------------------------------------
// MENSAGERIA / WHATSAPP
// ----------------------------------------------------------------------------

export type WhatsAppProvider = 'EVOLUTION_API' | 'Z_API' | 'CLOUD_API' | 'NENHUM';

export interface WhatsAppGatewayConfig {
  provider: WhatsAppProvider;
  baseUrl: string;
  apiKey: string;
  instanceId?: string; // Evolution API / Z-API costumam usar "instância"
  fromPhoneNumberId?: string; // Cloud API oficial
}

export interface SendMessageResult {
  success: boolean;
  channel: 'API_GATEWAY' | 'DEEP_LINK' | 'NENHUM';
  detail: string;
}

// ----------------------------------------------------------------------------
// ALEXA / VOZ
// ----------------------------------------------------------------------------

export type AlexaEventType =
  | 'SEND_MESSAGE_INTENT'
  | 'FALL_EMERGENCY_TRIGGER'
  | 'CONNECTION_STATUS'
  | 'UNKNOWN';

/** Payload normalizado recebido do bridge (WebSocket ou Lambda -> REST). */
export interface AlexaIncomingEvent {
  type: AlexaEventType;
  raw: unknown;
  utterance?: string; // Frase transcrita original, ex: "enviar mensagem para Maria"
  slots?: Record<string, string>; // Slots extraídos pela Alexa Skill (ex: { contato: "Maria" })
  receivedAt: number;
}

export interface EmergencyRoutineParams {
  contactQuery: string; // Nome (ou fragmento) do contato buscado na agenda
  messageOverride?: string;
  reason: 'VOICE_COMMAND' | 'FALL_DETECTED';
}
