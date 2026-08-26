/**
 * VisionPilotScreen.tsx
 * ------------------------------------------------------------------------
 * Tela de monitoramento visual em tempo real. Solicita permissão de
 * câmera, exibe o preview via react-native-vision-camera com o frame
 * processor do useBehaviorVision anexado, e sobrepõe o HUDOverlay com a
 * telemetria calculada a cada frame.
 *
 * Ao detectar uma queda sustentada por mais de 3s, dispara a rotina de
 * emergência (consulta contato -> WhatsApp) através do
 * alexaIntegrationService.runEmergencyRoutine — o mesmo pipeline usado
 * pelos comandos de voz da Alexa.
 * ------------------------------------------------------------------------
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import { useBehaviorVision } from '@/services/vision/useBehaviorVision';
import { HUDOverlay } from '@/components/HUDOverlay';
import { runEmergencyRoutine } from '@/services/voice/alexaIntegrationService';

export function VisionPilotScreen(): React.JSX.Element {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [isSendingEmergency, setIsSendingEmergency] = useState(false);

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const handleFallEmergencyTriggered = useCallback(() => {
    if (isSendingEmergency) return; // evita disparos concorrentes duplicados
    setIsSendingEmergency(true);

    runEmergencyRoutine({ contactQuery: '', reason: 'FALL_DETECTED' })
      .then((result) => {
        Alert.alert(
          result.success ? 'Emergência notificada' : 'Falha ao notificar emergência',
          result.detail,
        );
      })
      .catch((error: unknown) => {
        Alert.alert('Erro na rotina de emergência', String(error));
      })
      .finally(() => {
        setIsSendingEmergency(false);
      });
  }, [isSendingEmergency]);

  const { frameProcessor, latestResult, modelsReady, modelLoadError } = useBehaviorVision({
    onFallEmergencyTriggered: handleFallEmergencyTriggered,
    enabled: isScreenFocused,
  });

  useEffect(
    () => () => {
      setIsScreenFocused(false);
    },
    [],
  );

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>Aguardando permissão de câmera...</Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>Nenhuma câmera frontal disponível neste dispositivo.</Text>
      </View>
    );
  }

  if (modelLoadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{modelLoadError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isScreenFocused}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        fps={30}
      />

      <HUDOverlay result={latestResult} modelsReady={modelsReady} />

      {!modelsReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#78DCFF" />
        </View>
      )}

      {isSendingEmergency && (
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyBannerText}>Enviando alerta de emergência...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'black',
    padding: 24,
  },
  infoText: {
    color: 'white',
    fontSize: 15,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  emergencyBanner: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emergencyBannerText: {
    color: 'white',
    fontWeight: '600',
  },
});
