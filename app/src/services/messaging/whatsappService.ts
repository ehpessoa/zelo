/**
 * whatsappService.ts
 * ------------------------------------------------------------------------
 * Camada de disparo de mensagens WhatsApp com suporte a três gateways de
 * API (Evolution API, Z-API, WhatsApp Cloud API oficial) e fallback
 * automático via deep link nativo (`whatsapp://send`) quando nenhum
 * gateway está configurado ou a chamada HTTP falha.
 * ------------------------------------------------------------------------
 */
import axios, { AxiosError } from 'axios';
import { Linking } from 'react-native';
import type { SendMessageResult, WhatsAppGatewayConfig } from '@/types';

/**
 * Configuração ativa do gateway. Em produção isso viria de variáveis de
 * ambiente / secure storage — mantido aqui como objeto mutável simples
 * para o escopo do MVP.
 */
let activeGatewayConfig: WhatsAppGatewayConfig = {
  provider: 'NENHUM',
  baseUrl: '',
  apiKey: '',
};

export function configureWhatsAppGateway(config: WhatsAppGatewayConfig): void {
  activeGatewayConfig = config;
}

export function getWhatsAppGatewayConfig(): WhatsAppGatewayConfig {
  return activeGatewayConfig;
}

/** Normaliza um telefone para dígitos apenas, garantindo DDI presente. */
function normalizePhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  // Assume DDI 55 (Brasil) se o número tiver 10-11 dígitos (DDD + número, sem DDI).
  if (digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Monta e envia o payload HTTP conforme o provedor configurado.
 * Cada provedor tem um contrato de API distinto — isolado aqui para que
 * trocar de gateway não afete o restante da aplicação.
 */
async function sendViaGateway(
  phoneNumber: string,
  message: string,
): Promise<SendMessageResult> {
  const fullPhone = normalizePhone(phoneNumber);
  const { provider, baseUrl, apiKey, instanceId, fromPhoneNumberId } = activeGatewayConfig;

  try {
    switch (provider) {
      case 'EVOLUTION_API': {
        // Evolution API: POST /message/sendText/{instance}
        const url = `${baseUrl}/message/sendText/${instanceId}`;
        await axios.post(
          url,
          { number: fullPhone, text: message },
          { headers: { apikey: apiKey }, timeout: 10000 },
        );
        return { success: true, channel: 'API_GATEWAY', detail: 'Enviado via Evolution API' };
      }

      case 'Z_API': {
        // Z-API: POST /instances/{instance}/token/{token}/send-text
        const url = `${baseUrl}/instances/${instanceId}/token/${apiKey}/send-text`;
        await axios.post(url, { phone: fullPhone, message }, { timeout: 10000 });
        return { success: true, channel: 'API_GATEWAY', detail: 'Enviado via Z-API' };
      }

      case 'CLOUD_API': {
        // WhatsApp Cloud API oficial (Meta): POST /{phone-number-id}/messages
        const url = `${baseUrl}/${fromPhoneNumberId}/messages`;
        await axios.post(
          url,
          {
            messaging_product: 'whatsapp',
            to: fullPhone,
            type: 'text',
            text: { body: message },
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        );
        return { success: true, channel: 'API_GATEWAY', detail: 'Enviado via WhatsApp Cloud API' };
      }

      case 'NENHUM':
      default:
        return { success: false, channel: 'NENHUM', detail: 'Nenhum gateway configurado' };
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    return {
      success: false,
      channel: 'API_GATEWAY',
      detail: `Erro no gateway (${provider}): ${axiosError.message}`,
    };
  }
}

/**
 * Fallback nativo: abre o WhatsApp instalado no dispositivo com a mensagem
 * pré-preenchida via URL scheme. Requer interação/foreground do app —
 * usado quando o gateway HTTP não está disponível ou falhou.
 */
async function sendViaDeepLink(
  phoneNumber: string,
  message: string,
): Promise<SendMessageResult> {
  const fullPhone = normalizePhone(phoneNumber);
  const encodedMessage = encodeURIComponent(message);
  const deepLinkUrl = `whatsapp://send?phone=${fullPhone}&text=${encodedMessage}`;

  try {
    const canOpen = await Linking.canOpenURL(deepLinkUrl);
    if (!canOpen) {
      return {
        success: false,
        channel: 'DEEP_LINK',
        detail: 'WhatsApp não está instalado neste dispositivo',
      };
    }
    await Linking.openURL(deepLinkUrl);
    return { success: true, channel: 'DEEP_LINK', detail: 'Aberto via deep link do WhatsApp' };
  } catch (error) {
    return {
      success: false,
      channel: 'DEEP_LINK',
      detail: `Falha ao abrir deep link: ${String(error)}`,
    };
  }
}

/**
 * Função principal exposta ao resto do app. Tenta primeiro o gateway HTTP
 * configurado (permite envio 100% em segundo plano, sem abrir o WhatsApp);
 * se não houver gateway ou a chamada falhar, cai para o deep link nativo.
 */
export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string,
): Promise<SendMessageResult> {
  if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 8) {
    return { success: false, channel: 'NENHUM', detail: 'Número de telefone inválido' };
  }

  if (activeGatewayConfig.provider !== 'NENHUM') {
    const gatewayResult = await sendViaGateway(phoneNumber, message);
    if (gatewayResult.success) {
      return gatewayResult;
    }
    // Gateway falhou — cai para deep link como fallback.
    return sendViaDeepLink(phoneNumber, message);
  }

  return sendViaDeepLink(phoneNumber, message);
}
