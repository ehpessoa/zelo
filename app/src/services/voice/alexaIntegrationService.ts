/**
 * alexaIntegrationService.ts
 * ------------------------------------------------------------------------
 * Ponte entre comandos de voz da Alexa e as rotinas internas do app.
 *
 * Arquitetura assumida:
 *   [Usuário fala com a Alexa]
 *        -> Alexa Custom Skill (AWS) interpreta a intent
 *        -> AWS Lambda formata o evento e publica em um canal (ex: um
 *           servidor WebSocket / API Gateway WebSocket, ou um tópico
 *           que este serviço assina) para o qual o app mantém uma
 *           conexão persistente enquanto em primeiro/segundo plano.
 *   [Este serviço] recebe o evento normalizado, extrai a intent e os
 *        slots, resolve o contato na agenda local e dispara o envio via
 *        whatsappService.
 *
 * O mesmo pipeline de `runEmergencyRoutine` é reutilizado pelo gatilho de
 * queda do useBehaviorVision, garantindo uma única fonte de verdade para
 * "Comando Alexa / Gatilho de Queda -> Consulta Contato -> Disparo WhatsApp".
 * ------------------------------------------------------------------------
 */
import { io, type Socket } from 'socket.io-client';
import type {
  AlexaIncomingEvent,
  AlexaEventType,
  EmergencyRoutineParams,
} from '@/types';
import { useContactsStore } from '@/state/contactsStore';
import { sendWhatsAppMessage } from '@/services/messaging/whatsappService';
import { toFullPhone } from '@/types';

export interface AlexaBridgeConfig {
  /** URL do servidor WebSocket / bridge que repassa eventos da Alexa Skill. */
  websocketUrl: string;
  /** Token de autenticação do dispositivo/usuário junto ao bridge. */
  authToken: string;
}

export type EmergencyRoutineResult = {
  success: boolean;
  detail: string;
};

type RoutineListener = (result: EmergencyRoutineResult, params: EmergencyRoutineParams) => void;
type ConnectionListener = (connected: boolean) => void;

let socketInstance: Socket | null = null;
const routineListeners = new Set<RoutineListener>();
const connectionListeners = new Set<ConnectionListener>();

/** Mensagem padrão enviada em disparos de emergência por queda. */
const DEFAULT_FALL_MESSAGE =
  '🚨 Alerta automático: uma possível queda foi detectada e a pessoa não se moveu por alguns segundos. Por favor, verifique o quanto antes.';

/**
 * Extrai a intent normalizada e os slots de um payload cru vindo do bridge.
 * O formato exato depende de como a Lambda da Alexa Skill serializa o
 * evento — este parser assume um envelope JSON simples e é o único ponto
 * que precisa mudar caso o contrato do bridge mude.
 */
function parseIncomingPayload(raw: unknown): AlexaIncomingEvent {
  const receivedAt = Date.now();

  if (typeof raw !== 'object' || raw === null) {
    return { type: 'UNKNOWN', raw, receivedAt };
  }

  const payload = raw as Record<string, unknown>;
  const intentName = typeof payload.intent === 'string' ? payload.intent : '';
  const utterance = typeof payload.utterance === 'string' ? payload.utterance : undefined;
  const slots =
    typeof payload.slots === 'object' && payload.slots !== null
      ? (payload.slots as Record<string, string>)
      : undefined;

  let type: AlexaEventType = 'UNKNOWN';
  if (intentName === 'SendMessageIntent') {
    type = 'SEND_MESSAGE_INTENT';
  } else if (intentName === 'FallEmergencyIntent') {
    type = 'FALL_EMERGENCY_TRIGGER';
  } else if (intentName === 'ConnectionStatus') {
    type = 'CONNECTION_STATUS';
  }

  return { type, raw, utterance, slots, receivedAt };
}

/**
 * Rotina central de emergência, reutilizável tanto por comandos de voz
 * quanto pelo gatilho automático de queda do pipeline de visão:
 *   [Gatilho] -> Consulta Contato -> Disparo WhatsApp
 */
export async function runEmergencyRoutine(
  params: EmergencyRoutineParams,
): Promise<EmergencyRoutineResult> {
  const { findContactByName, getPrimaryEmergencyContacts } = useContactsStore.getState();

  // Se o gatilho for por queda e nenhum nome específico foi passado,
  // usamos os contatos marcados como emergência primária.
  const targets =
    params.reason === 'FALL_DETECTED' && !params.contactQuery
      ? getPrimaryEmergencyContacts()
      : [findContactByName(params.contactQuery)].filter(
          (c): c is NonNullable<typeof c> => c !== undefined,
        );

  if (targets.length === 0) {
    const result: EmergencyRoutineResult = {
      success: false,
      detail: `Nenhum contato encontrado para "${params.contactQuery || 'contato de emergência'}"`,
    };
    notifyRoutineListeners(result, params);
    return result;
  }

  const message =
    params.messageOverride ??
    (params.reason === 'FALL_DETECTED' ? DEFAULT_FALL_MESSAGE : 'Cheguei bem, obrigado por perguntar!');

  const sendResults = await Promise.all(
    targets.map((contact) => sendWhatsAppMessage(toFullPhone(contact), message)),
  );

  const allSucceeded = sendResults.every((r) => r.success);
  const result: EmergencyRoutineResult = {
    success: allSucceeded,
    detail: allSucceeded
      ? `Mensagem enviada para: ${targets.map((t) => t.name).join(', ')}`
      : `Falha parcial ou total ao notificar: ${targets.map((t) => t.name).join(', ')}`,
  };

  notifyRoutineListeners(result, params);
  return result;
}

function notifyRoutineListeners(
  result: EmergencyRoutineResult,
  params: EmergencyRoutineParams,
): void {
  routineListeners.forEach((listener) => listener(result, params));
}

/** Permite que a UI (ex: VisionPilotScreen) reaja a rotinas disparadas. */
export function onEmergencyRoutineResult(listener: RoutineListener): () => void {
  routineListeners.add(listener);
  return () => routineListeners.delete(listener);
}

export function onAlexaConnectionChange(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

/**
 * Processa um evento já normalizado vindo do bridge (WebSocket ou webhook
 * REST tratado por outro módulo que chame esta mesma função).
 */
export async function handleAlexaEvent(event: AlexaIncomingEvent): Promise<void> {
  switch (event.type) {
    case 'SEND_MESSAGE_INTENT': {
      // Ex: slots = { contato: "Maria" }, utterance = "avisar a Maria que cheguei"
      const contactQuery = event.slots?.contato ?? extractContactFromUtterance(event.utterance);
      const messageOverride = event.slots?.mensagem;
      if (contactQuery) {
        await runEmergencyRoutine({
          contactQuery,
          messageOverride,
          reason: 'VOICE_COMMAND',
        });
      }
      break;
    }

    case 'FALL_EMERGENCY_TRIGGER': {
      await runEmergencyRoutine({ contactQuery: '', reason: 'FALL_DETECTED' });
      break;
    }

    case 'CONNECTION_STATUS':
    case 'UNKNOWN':
    default:
      break;
  }
}

/**
 * Fallback simples de extração de nome de contato a partir da frase crua,
 * usado quando a Alexa Skill não retorna slots estruturados (ex.: testes
 * manuais via webhook). Em produção, prefira sempre slots estruturados
 * definidos no modelo de interação da Custom Skill.
 */
function extractContactFromUtterance(utterance?: string): string {
  if (!utterance) return '';
  // Captura o texto após "para" ou "avisar a/o" como heurística leve.
  const match = utterance.match(/(?:para|avisar[ao]?)\s+([a-zA-ZÀ-ÿ\s]+)/i);
  return match?.[1]?.trim() ?? '';
}

/**
 * Estabelece a conexão persistente com o bridge de eventos da Alexa
 * (servidor WebSocket alimentado pela Lambda da Custom Skill).
 * Deve ser chamado uma vez, tipicamente na inicialização do App.tsx.
 */
export function connectAlexaBridge(config: AlexaBridgeConfig): void {
  if (socketInstance) {
    socketInstance.disconnect();
  }

  socketInstance = io(config.websocketUrl, {
    transports: ['websocket'],
    auth: { token: config.authToken },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
  });

  socketInstance.on('connect', () => {
    connectionListeners.forEach((listener) => listener(true));
  });

  socketInstance.on('disconnect', () => {
    connectionListeners.forEach((listener) => listener(false));
  });

  // Nome do evento deve corresponder ao que a Lambda/bridge publica.
  socketInstance.on('alexa_intent_event', (raw: unknown) => {
    const parsedEvent = parseIncomingPayload(raw);
    void handleAlexaEvent(parsedEvent);
  });
}

export function disconnectAlexaBridge(): void {
  socketInstance?.disconnect();
  socketInstance = null;
}

/**
 * Ponto de entrada alternativo para integrações via webhook REST (caso o
 * backend prefira enviar POST em vez de manter WebSocket). Um endpoint
 * Express/Lambda simples pode chamar esta função diretamente após validar
 * a assinatura da requisição vinda da Alexa/AWS.
 */
export async function handleAlexaWebhookPayload(raw: unknown): Promise<void> {
  const parsedEvent = parseIncomingPayload(raw);
  await handleAlexaEvent(parsedEvent);
}
