/**
 * HUDOverlay.tsx
 * ------------------------------------------------------------------------
 * Overlay translúcido em Skia sobreposto ao preview da câmera, exibindo
 * telemetria em tempo real: FPS, Postura, Emoção e banner de alerta de
 * queda. Renderizado via @shopify/react-native-skia para manter 60fps
 * mesmo com atualizações frequentes de estado.
 * ------------------------------------------------------------------------
 */
import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas,
  RoundedRect,
  Text as SkiaText,
  useFont,
  Group,
} from '@shopify/react-native-skia';
import type { VisionFrameResult } from '@/types';

interface HUDOverlayProps {
  result: VisionFrameResult | null;
  modelsReady: boolean;
}

const POSTURE_LABELS: Record<string, string> = {
  EM_PE: 'Em pé',
  SENTADO: 'Sentado',
  DEITADO: 'Deitado',
  DESCONHECIDO: '—',
};

const EMOTION_LABELS: Record<string, string> = {
  NEUTRO: 'Neutro',
  ALEGRIA: 'Alegria 🙂',
  SURPRESA: 'Surpresa 😮',
  TRISTEZA: 'Tristeza 🙁',
  DESCONHECIDO: '—',
};

const MOVEMENT_LABELS: Record<string, string> = {
  ESTATICO: 'Estático',
  INQUIETO: 'Inquieto',
  DESCONHECIDO: '—',
};

export function HUDOverlay({ result, modelsReady }: HUDOverlayProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const font = useFont(require('@/../assets/fonts/RobotoMono-Regular.ttf'), 14);
  const fontBold = useFont(require('@/../assets/fonts/RobotoMono-Bold.ttf'), 18);

  const panelWidth = Math.min(width - 32, 340);
  const isEmergency = result?.alertLevel === 'EMERGENCIA';
  const isAttention = result?.alertLevel === 'ATENCAO';

  const lines = useMemo(() => {
    if (!result) return [];
    return [
      `FPS: ${result.fps}`,
      `Postura: ${POSTURE_LABELS[result.posture]}`,
      `Movimento: ${MOVEMENT_LABELS[result.movement]}`,
      `Emoção: ${EMOTION_LABELS[result.emotion]}`,
    ];
  }, [result]);

  return (
    <>
      {/* Overlay React Native para banners de status simples (fora do Canvas Skia) */}
      {!modelsReady && (
        <RNStatusBanner text="Carregando modelos de visão on-device..." tone="info" />
      )}

      <Canvas style={[styles.canvas, { width: panelWidth }]} pointerEvents="none">
        {/* Painel translúcido de métricas */}
        <RoundedRect x={0} y={0} width={panelWidth} height={130} r={16} color="rgba(10,15,20,0.55)" />

        {font && fontBold && result && (
          <Group>
            <SkiaText
              x={16}
              y={30}
              text="TELEMETRIA"
              font={fontBold}
              color="rgba(120,220,255,0.9)"
            />
            {lines.map((line, index) => (
              <SkiaText
                key={line}
                x={16}
                y={54 + index * 20}
                text={line}
                font={font}
                color="white"
              />
            ))}
          </Group>
        )}

        {/* Banner de alerta de queda (atenção -> emergência) */}
        {(isAttention || isEmergency) && fontBold && (
          <Group>
            <RoundedRect
              x={0}
              y={140}
              width={panelWidth}
              height={44}
              r={12}
              color={isEmergency ? 'rgba(220,38,38,0.85)' : 'rgba(234,179,8,0.85)'}
            />
            <SkiaText
              x={16}
              y={168}
              text={
                isEmergency
                  ? `⚠️ EMERGÊNCIA: Queda sustentada (${Math.round(
                      (result?.fallSustainedMs ?? 0) / 1000,
                    )}s)`
                  : '⚠️ Possível queda detectada...'
              }
              font={fontBold}
              color="white"
            />
          </Group>
        )}
      </Canvas>
    </>
  );
}

/**
 * Banner simples de status (usa componentes nativos RN, não Skia) para
 * mensagens de carregamento — evita depender da fonte Skia estar pronta.
 */
function RNStatusBanner({
  text,
  tone,
}: {
  text: string;
  tone: 'info' | 'warning';
}): React.JSX.Element {
  return (
    <RNView style={[styles.statusBanner, tone === 'warning' && styles.statusBannerWarning]}>
      <RNText style={styles.statusBannerText}>{text}</RNText>
    </RNView>
  );
}

// Import local para evitar poluir o topo do arquivo com componentes pouco usados.
import { View as RNView, Text as RNText } from 'react-native';

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 16,
    left: 16,
    height: 200,
  },
  statusBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(10,15,20,0.7)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statusBannerWarning: {
    backgroundColor: 'rgba(234,179,8,0.85)',
  },
  statusBannerText: {
    color: 'white',
    fontSize: 13,
  },
});
