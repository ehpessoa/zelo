# Modelos TFLite

Coloque aqui os arquivos de modelo baixados:

- `pose_landmark.tflite` — modelo de estimativa de pose (ex: BlazePose ou MoveNet,
  convertido para TFLite, saída com 33 landmarks x [x,y,z,visibility]).
- `face_landmark.tflite` — modelo de Face Mesh (ex: MediaPipe FaceMesh,
  convertido para TFLite, saída com 478 landmarks x [x,y,z]).

Ambos os arquivos NÃO estão incluídos neste repositório (arquivos binários
grandes). Baixe as versões `.tflite` oficiais do MediaPipe Model Zoo ou
converta os modelos `.task`/`SavedModel` correspondentes com o
`tflite_convert` do TensorFlow.

Os índices de landmarks usados em `useBehaviorVision.ts` (parsePoseOutput /
parseFaceMeshOutput) seguem a topologia padrão do BlazePose (33 pontos) e do
MediaPipe FaceMesh (478 pontos). Se você usar um modelo com topologia
diferente, ajuste os índices em `POSE_INDEX` / `FACE_INDEX`.
