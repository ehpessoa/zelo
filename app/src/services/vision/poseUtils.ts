/**
 * poseUtils.ts
 * ------------------------------------------------------------------------
 * Funções PURAS de geometria/cinemática usadas dentro do frame processor
 * (worklet). Não importam nada de React/estado para poderem rodar na
 * JS thread do VisionCamera sem serialização custosa.
 *
 * Todas as coordenadas de landmarks são normalizadas (0..1) relativas ao
 * frame da câmera, com origem no canto superior esquerdo.
 * ------------------------------------------------------------------------
 */
import type {
  Landmark,
  PoseLandmarks,
  PostureState,
  MovementState,
  EmotionState,
} from '@/types';

/** Distância euclidiana 2D entre dois landmarks (ignora Z para robustez). */
export function euclideanDistance2D(a: Landmark, b: Landmark): number {
  'worklet';
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ponto médio entre dois landmarks (ex: centro dos ombros, centro dos quadris). */
export function midpoint(a: Landmark, b: Landmark): Landmark {
  'worklet';
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

/**
 * Calcula o ângulo (em graus) formado pelo vértice `vertex` entre os
 * segmentos vertex->a e vertex->b, usando a lei dos cossenos.
 * Usado para o ângulo do tronco (ombro-quadril-joelho) e do joelho
 * (quadril-joelho-tornozelo).
 */
export function angleBetweenPoints(a: Landmark, vertex: Landmark, b: Landmark): number {
  'worklet';
  const abx = a.x - vertex.x;
  const aby = a.y - vertex.y;
  const cbx = b.x - vertex.x;
  const cby = b.y - vertex.y;

  const dot = abx * cbx + aby * cby;
  const magAB = Math.sqrt(abx * abx + aby * aby);
  const magCB = Math.sqrt(cbx * cbx + cby * cby);

  if (magAB === 0 || magCB === 0) return 0;

  // Clamp para evitar NaN por imprecisão de ponto flutuante em acos.
  const cosAngle = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Ângulo do tronco em relação à vertical (0° = perfeitamente ereto/vertical,
 * 90° = totalmente horizontal). Calculado a partir do vetor
 * (centro dos quadris -> centro dos ombros) contra o eixo Y (vertical da imagem).
 *
 * Esse ângulo é o principal insumo para diferenciar EM_PE / SENTADO / DEITADO
 * e para a heurística de queda (mudança abrupta de vertical -> horizontal).
 */
export function trunkAngleFromVertical(shoulderMid: Landmark, hipMid: Landmark): number {
  'worklet';
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;

  // Vetor vertical de referência é (0, -1) — "para cima" na imagem.
  // atan2 do componente horizontal sobre o vertical nos dá o desvio da vertical.
  const angleRad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return (angleRad * 180) / Math.PI;
}

/**
 * Classifica a postura combinando:
 *  - ângulo do tronco em relação à vertical
 *  - ângulo do joelho (flexão indica sentado)
 *  - proporção altura do quadril vs altura do ombro (queda de nível = deitado)
 */
export function classifyPosture(landmarks: PoseLandmarks): PostureState {
  'worklet';
  const shoulderMid = midpoint(landmarks.leftShoulder, landmarks.rightShoulder);
  const hipMid = midpoint(landmarks.leftHip, landmarks.rightHip);
  const kneeMid = midpoint(landmarks.leftKnee, landmarks.rightKnee);

  const trunkAngle = trunkAngleFromVertical(shoulderMid, hipMid);
  const kneeAngle = angleBetweenPoints(hipMid, kneeMid, midpoint(landmarks.leftAnkle, landmarks.rightAnkle));

  // Tronco quase horizontal (>55°) => corpo deitado.
  if (trunkAngle > 55) {
    return 'DEITADO';
  }

  // Tronco relativamente vertical, mas joelho fortemente flexionado (<130°)
  // e quadril próximo em altura ao joelho => sentado.
  const hipKneeVerticalGap = Math.abs(hipMid.y - kneeMid.y);
  if (kneeAngle < 130 && hipKneeVerticalGap < 0.18) {
    return 'SENTADO';
  }

  if (trunkAngle <= 25) {
    return 'EM_PE';
  }

  return 'EM_PE'; // fallback conservador para ângulos intermediários (25-55°) em pé inclinado
}

/**
 * Buffer circular simples de posições do centro de massa (quadril) ao longo
 * do tempo, usado para estimar velocidade vertical (queda) e variância
 * (inquietação). Mantido fora de React state para uso dentro do worklet.
 */
export interface MotionSample {
  timestampMs: number;
  hipY: number; // posição vertical normalizada do centro do quadril
  trunkAngle: number;
}

const MOTION_BUFFER_MAX_SIZE = 30; // ~1s a 30fps

export function pushMotionSample(
  buffer: MotionSample[],
  sample: MotionSample,
): MotionSample[] {
  'worklet';
  const next = buffer.length >= MOTION_BUFFER_MAX_SIZE ? buffer.slice(1) : buffer.slice();
  next.push(sample);
  return next;
}

/**
 * Estima a velocidade vertical do quadril (em unidades normalizadas/segundo)
 * comparando a amostra mais antiga com a mais recente do buffer.
 * Um valor positivo alto e um salto de ângulo do tronco (vertical -> horizontal)
 * em curto intervalo é a assinatura cinemática de uma queda.
 */
export function estimateVerticalVelocity(buffer: MotionSample[]): number {
  'worklet';
  if (buffer.length < 2) return 0;
  const first = buffer[0];
  const last = buffer[buffer.length - 1];
  const dtSeconds = (last.timestampMs - first.timestampMs) / 1000;
  if (dtSeconds <= 0) return 0;
  return (last.hipY - first.hipY) / dtSeconds;
}

/** Desvio padrão do ângulo do tronco no buffer — proxy para "inquietação". */
export function trunkAngleStdDev(buffer: MotionSample[]): number {
  'worklet';
  if (buffer.length < 2) return 0;
  const mean = buffer.reduce((acc, s) => acc + s.trunkAngle, 0) / buffer.length;
  const variance =
    buffer.reduce((acc, s) => acc + (s.trunkAngle - mean) ** 2, 0) / buffer.length;
  return Math.sqrt(variance);
}

export function classifyMovement(buffer: MotionSample[]): MovementState {
  'worklet';
  if (buffer.length < 5) return 'DESCONHECIDO';
  const stdDev = trunkAngleStdDev(buffer);
  // Limiar empírico: pequenas oscilações de ângulo = estático; grandes = inquieto.
  return stdDev > 6 ? 'INQUIETO' : 'ESTATICO';
}

/**
 * Detecção de queda: velocidade vertical do quadril acima do limiar
 * (queda rápida do centro de massa) COMBINADA com transição do tronco
 * para ângulo próximo do horizontal dentro da janela do buffer.
 *
 * Limiares em unidades normalizadas/segundo — calibrados para 30fps e
 * um FOV padrão de câmera frontal/traseira de celular a ~1.5-3m.
 */
const FALL_VELOCITY_THRESHOLD = 1.2; // unidades normalizadas / segundo
const FALL_TRUNK_ANGLE_THRESHOLD = 50; // graus

export function detectFallKinematics(buffer: MotionSample[]): boolean {
  'worklet';
  if (buffer.length < 6) return false;
  const velocity = estimateVerticalVelocity(buffer);
  const latestTrunkAngle = buffer[buffer.length - 1].trunkAngle;
  return velocity > FALL_VELOCITY_THRESHOLD && latestTrunkAngle > FALL_TRUNK_ANGLE_THRESHOLD;
}

// ----------------------------------------------------------------------------
// FACE MESH -> EMOÇÃO (heurística geométrica leve, sem classificador extra)
// ----------------------------------------------------------------------------

export interface FaceMeshKeyPoints {
  mouthLeft: Landmark;
  mouthRight: Landmark;
  mouthTop: Landmark;
  mouthBottom: Landmark;
  leftEyeTop: Landmark;
  leftEyeBottom: Landmark;
  rightEyeTop: Landmark;
  rightEyeBottom: Landmark;
  leftEyebrowInner: Landmark;
  rightEyebrowInner: Landmark;
}

/**
 * Razão de abertura labial: distância vertical da boca / distância horizontal.
 * Valores altos = boca bem aberta (surpresa); valores baixos + cantos elevados
 * = sorriso.
 */
export function mouthAspectRatio(points: FaceMeshKeyPoints): number {
  'worklet';
  const verticalGap = euclideanDistance2D(points.mouthTop, points.mouthBottom);
  const horizontalGap = euclideanDistance2D(points.mouthLeft, points.mouthRight);
  if (horizontalGap === 0) return 0;
  return verticalGap / horizontalGap;
}

/**
 * "Curvatura" do sorriso: o quanto os cantos da boca estão acima do centro
 * vertical da boca. Valores negativos de Y (na convenção de imagem, Y cresce
 * para baixo) indicam cantos elevados = sorriso.
 */
export function mouthCurvature(points: FaceMeshKeyPoints): number {
  'worklet';
  const mouthCenterY = (points.mouthTop.y + points.mouthBottom.y) / 2;
  const cornersAvgY = (points.mouthLeft.y + points.mouthRight.y) / 2;
  // Positivo quando os cantos estão ACIMA do centro da boca (imagem: y menor = mais alto).
  return mouthCenterY - cornersAvgY;
}

/** Distância média sobrancelha-olho, usada como proxy de sobrancelhas franzidas (tristeza). */
export function eyebrowEyeGap(points: FaceMeshKeyPoints): number {
  'worklet';
  const left = euclideanDistance2D(points.leftEyebrowInner, points.leftEyeTop);
  const right = euclideanDistance2D(points.rightEyebrowInner, points.rightEyeTop);
  return (left + right) / 2;
}

const SMILE_CURVATURE_THRESHOLD = 0.015;
const SURPRISE_MOUTH_RATIO_THRESHOLD = 0.55;
const SAD_EYEBROW_GAP_THRESHOLD = 0.045; // sobrancelhas caídas/próximas dos olhos

export function classifyEmotion(points: FaceMeshKeyPoints): EmotionState {
  'worklet';
  const mar = mouthAspectRatio(points);
  const curvature = mouthCurvature(points);
  const browGap = eyebrowEyeGap(points);

  if (mar > SURPRISE_MOUTH_RATIO_THRESHOLD) {
    return 'SURPRESA';
  }
  if (curvature > SMILE_CURVATURE_THRESHOLD) {
    return 'ALEGRIA';
  }
  if (browGap < SAD_EYEBROW_GAP_THRESHOLD) {
    return 'TRISTEZA';
  }
  return 'NEUTRO';
}
