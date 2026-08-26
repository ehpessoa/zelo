/**
 * useBehaviorVision.ts
 * ------------------------------------------------------------------------
 * Hook customizado que orquestra:
 *   1. Carregamento dos modelos .tflite (pose + face mesh) via react-native-fast-tflite
 *   2. Frame processor (worklet) do react-native-vision-camera que roda a
 *      inferência a cada frame, sem bloquear a UI thread.
 *   3. Motor cinemático (poseUtils) para postura / movimento / queda / emoção.
 *   4. Disparo de rotina de emergência quando uma queda persiste > 3s.
 *
 * Zero código nativo C++/Java é escrito aqui — toda a lógica de negócio
 * roda em TypeScript, com o worklet apenas fazendo a ponte de dados entre
 * a JS thread e a thread de captura via react-native-worklets-core.
 * ------------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTensorflowModel } from 'react-native-fast-tflite';
import {
  useFrameProcessor,
  type Frame,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

import {
  classifyPosture,
  classifyMovement,
  classifyEmotion,
  detectFallKinematics,
  pushMotionSample,
  trunkAngleFromVertical,
  midpoint,
  type MotionSample,
  type FaceMeshKeyPoints,
} from './poseUtils';
import type {
  PoseLandmarks,
  VisionFrameResult,
  AlertLevel,
} from '@/types';

/** Tempo (ms) que uma queda precisa persistir continuamente para virar emergência. */
const FALL_EMERGENCY_PERSISTENCE_MS = 3000;

/** Tamanho de entrada esperado pelos modelos tflite (ex: 256x256 para BlazePose). */
const MODEL_INPUT_SIZE = 256;

interface UseBehaviorVisionParams {
  /** Callback invocado quando a rotina de emergência por queda deve ser disparada. */
  onFallEmergencyTriggered: () => void;
  /** Ativa/desativa o processamento (ex: pausar quando a tela perde foco). */
  enabled: boolean;
}

interface UseBehaviorVisionReturn {
  frameProcessor: ReturnType<typeof useFrameProcessor> | undefined;
  latestResult: VisionFrameResult | null;
  modelsReady: boolean;
  modelLoadError: string | null;
}

/**
 * Converte os tensores brutos de saída do modelo de pose (formato flat
 * Float32Array, ex: [x0,y0,z0,score0, x1,y1,z1,score1, ...]) para o
 * objeto tipado `PoseLandmarks` usado pelas heurísticas de poseUtils.
 *
 * O índice de cada landmark segue a convenção padrão do BlazePose/MoveNet
 * (33 pontos). Aqui extraímos apenas o subconjunto necessário ao MVP.
 */
function parsePoseOutput(output: Float32Array): PoseLandmarks {
  'worklet';
  const POSE_INDEX = {
    nose: 0,
    leftShoulder: 11,
    rightShoulder: 12,
    leftHip: 23,
    rightHip: 24,
    leftKnee: 25,
    rightKnee: 26,
    leftAnkle: 27,
    rightAnkle: 28,
  } as const;

  const readLandmark = (idx: number) => {
    const base = idx * 4; // x, y, z, visibility por ponto
    return {
      x: output[base] ?? 0,
      y: output[base + 1] ?? 0,
      z: output[base + 2] ?? 0,
      visibility: output[base + 3] ?? 0,
    };
  };

  return {
    nose: readLandmark(POSE_INDEX.nose),
    leftShoulder: readLandmark(POSE_INDEX.leftShoulder),
    rightShoulder: readLandmark(POSE_INDEX.rightShoulder),
    leftHip: readLandmark(POSE_INDEX.leftHip),
    rightHip: readLandmark(POSE_INDEX.rightHip),
    leftKnee: readLandmark(POSE_INDEX.leftKnee),
    rightKnee: readLandmark(POSE_INDEX.rightKnee),
    leftAnkle: readLandmark(POSE_INDEX.leftAnkle),
    rightAnkle: readLandmark(POSE_INDEX.rightAnkle),
  };
}

/**
 * Converte a saída do modelo de face mesh (478 pontos, formato MediaPipe)
 * para o subconjunto de pontos-chave usado na heurística de emoção.
 * Índices seguem a topologia canônica do FaceMesh do MediaPipe.
 */
function parseFaceMeshOutput(output: Float32Array): FaceMeshKeyPoints {
  'worklet';
  const FACE_INDEX = {
    mouthLeft: 61,
    mouthRight: 291,
    mouthTop: 13,
    mouthBottom: 14,
    leftEyeTop: 159,
    leftEyeBottom: 145,
    rightEyeTop: 386,
    rightEyeBottom: 374,
    leftEyebrowInner: 55,
    rightEyebrowInner: 285,
  } as const;

  const readPoint = (idx: number) => {
    const base = idx * 3; // x, y, z por ponto (sem score no face mesh)
    return { x: output[base] ?? 0, y: output[base + 1] ?? 0, z: output[base + 2] ?? 0 };
  };

  return {
    mouthLeft: readPoint(FACE_INDEX.mouthLeft),
    mouthRight: readPoint(FACE_INDEX.mouthRight),
    mouthTop: readPoint(FACE_INDEX.mouthTop),
    mouthBottom: readPoint(FACE_INDEX.mouthBottom),
    leftEyeTop: readPoint(FACE_INDEX.leftEyeTop),
    leftEyeBottom: readPoint(FACE_INDEX.leftEyeBottom),
    rightEyeTop: readPoint(FACE_INDEX.rightEyeTop),
    rightEyeBottom: readPoint(FACE_INDEX.rightEyeBottom),
    leftEyebrowInner: readPoint(FACE_INDEX.leftEyebrowInner),
    rightEyebrowInner: readPoint(FACE_INDEX.rightEyebrowInner),
  };
}

export function useBehaviorVision({
  onFallEmergencyTriggered,
  enabled,
}: UseBehaviorVisionParams): UseBehaviorVisionReturn {
  // ---- Carregamento dos modelos TFLite -----------------------------------
  const poseModel = useTensorflowModel(require('@/../assets/models/pose_landmark.tflite'));
  const faceModel = useTensorflowModel(require('@/../assets/models/face_landmark.tflite'));

  const { resize } = useResizePlugin();

  const modelsReady =
    poseModel.state === 'loaded' && faceModel.state === 'loaded';

  const modelLoadError =
    poseModel.state === 'error'
      ? `Falha ao carregar pose_landmark.tflite: ${String(poseModel.error)}`
      : faceModel.state === 'error'
        ? `Falha ao carregar face_landmark.tflite: ${String(faceModel.error)}`
        : null;

  // ---- Estado compartilhado entre worklet (frame thread) e JS thread ----
  // Buffer de amostras cinemáticas (posição do quadril + ângulo do tronco).
  const motionBuffer = useSharedValue<MotionSample[]>([]);
  // Timestamp (ms) de quando a queda começou a ser detectada continuamente.
  const fallStartedAtMs = useSharedValue<number | null>(null);
  // Flag para evitar disparar a emergência mais de uma vez por evento de queda.
  const fallEmergencyAlreadyTriggered = useSharedValue<boolean>(false);

  const [latestResult, setLatestResult] = useState<VisionFrameResult | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());

  // Callback JS "ponte" chamado de dentro do worklet via runOnJS.
  const publishResult = useCallback((result: VisionFrameResult) => {
    setLatestResult(result);
  }, []);

  const triggerEmergency = useCallback(() => {
    onFallEmergencyTriggered();
  }, [onFallEmergencyTriggered]);

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      if (!modelsReady) return;

      const nowMs = Date.now();

      // --- 1. Pré-processamento: resize do frame para o tamanho do modelo ---
      const resized = resize(frame, {
        scale: {
          width: MODEL_INPUT_SIZE,
          height: MODEL_INPUT_SIZE,
        },
        pixelFormat: 'rgb',
        dataType: 'float32',
      });

      // --- 2. Inferência de pose ---
      const poseOutputs = poseModel.model?.runSync([resized]);
      if (!poseOutputs || poseOutputs.length === 0) return;
      const poseLandmarks = parsePoseOutput(poseOutputs[0] as Float32Array);

      // --- 3. Inferência de face mesh ---
      const faceOutputs = faceModel.model?.runSync([resized]);
      const faceKeyPoints = faceOutputs && faceOutputs.length > 0
        ? parseFaceMeshOutput(faceOutputs[0] as Float32Array)
        : null;

      // --- 4. Cálculo cinemático: ângulo do tronco e amostra de movimento ---
      const shoulderMid = midpoint(poseLandmarks.leftShoulder, poseLandmarks.rightShoulder);
      const hipMid = midpoint(poseLandmarks.leftHip, poseLandmarks.rightHip);
      const trunkAngle = trunkAngleFromVertical(shoulderMid, hipMid);

      motionBuffer.value = pushMotionSample(motionBuffer.value, {
        timestampMs: nowMs,
        hipY: hipMid.y,
        trunkAngle,
      });

      // --- 5. Classificações ---
      const posture = classifyPosture(poseLandmarks);
      const movement = classifyMovement(motionBuffer.value);
      const emotion = faceKeyPoints ? classifyEmotion(faceKeyPoints) : 'DESCONHECIDO';
      const fallDetectedThisFrame = detectFallKinematics(motionBuffer.value);

      // --- 6. Máquina de estados de queda persistente (>3s contínuos) ---
      let fallSustainedMs = 0;
      let alertLevel: AlertLevel = 'NENHUM';

      if (fallDetectedThisFrame) {
        if (fallStartedAtMs.value === null) {
          fallStartedAtMs.value = nowMs;
        }
        fallSustainedMs = nowMs - (fallStartedAtMs.value ?? nowMs);
        alertLevel = 'ATENCAO';

        if (
          fallSustainedMs >= FALL_EMERGENCY_PERSISTENCE_MS &&
          !fallEmergencyAlreadyTriggered.value
        ) {
          alertLevel = 'EMERGENCIA';
          fallEmergencyAlreadyTriggered.value = true;
          runOnJS(triggerEmergency)();
        }
      } else {
        // Reseta a máquina de estados quando a condição de queda não persiste.
        fallStartedAtMs.value = null;
        fallEmergencyAlreadyTriggered.value = false;
      }

      // --- 7. FPS instantâneo (aproximado pelo intervalo entre frames) ---
      const fps = frame.timestamp
        ? Math.round(1000 / Math.max(1, nowMs - (lastFrameTimeRef.current ?? nowMs)))
        : 0;

      const result: VisionFrameResult = {
        timestampMs: nowMs,
        fps,
        posture,
        movement,
        emotion,
        fallDetected: fallDetectedThisFrame,
        fallSustainedMs,
        alertLevel,
      };

      runOnJS(publishResult)(result);
    },
    [modelsReady, poseModel.model, faceModel.model, publishResult, triggerEmergency],
  );

  // Atualiza o timestamp de referência do último frame (fora do worklet).
  useEffect(() => {
    if (latestResult) {
      lastFrameTimeRef.current = latestResult.timestampMs;
    }
  }, [latestResult]);

  return useMemo(
    () => ({
      frameProcessor: enabled ? frameProcessor : undefined,
      latestResult,
      modelsReady,
      modelLoadError,
    }),
    [enabled, frameProcessor, latestResult, modelsReady, modelLoadError],
  );
}
