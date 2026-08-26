# Zelo — Monitor de Segurança com Visão Computacional, WhatsApp e Alexa

> MVP mobile em React Native + TypeScript que detecta postura, movimentação e
> quedas em tempo real via câmera on-device, e dispara alertas automáticos
> por WhatsApp — acionáveis também por comando de voz via Alexa.

Este repositório contém dois artefatos:

| Artefato | O que é | Onde está |
|---|---|---|
| **App mobile (RN)** | Codebase completa, pronta para rodar em iOS/Android | `vision-emergency-mvp.zip` |
| **Mockup web** | Protótipo interativo de UI/fluxo, roda direto no navegador | `zelo-mockup.html` |

---

## 1. Do que se trata

O Zelo nasceu para resolver um problema concreto: **pessoas que moram
sozinhas, idosos ou pessoas em reabilitação correm o risco de sofrer uma
queda e não terem como pedir ajuda**. O app fica em segundo plano com a
câmera observando (postura, movimento, expressão facial) e, se detectar uma
queda que persista por alguns segundos sem que a pessoa se levante, aciona
automaticamente uma rede de contatos de emergência via WhatsApp — sem
precisar de nenhuma ação manual da vítima.

O mesmo mecanismo de disparo também pode ser acionado por voz, via Alexa
("Alexa, avise a Maria que eu cheguei bem"), reaproveitando a mesma lógica
de busca de contato e envio de mensagem.

### Os três pilares

1. **Visão computacional 100% on-device** — nenhum frame de vídeo sai do
   aparelho. A inferência roda localmente com modelos `.tflite` (pose +
   face mesh), o que preserva a privacidade e funciona sem internet.
2. **Disparo de mensagens** — envia WhatsApp via API de gateway (Evolution
   API, Z-API ou Cloud API oficial da Meta) com fallback automático para
   link direto (`wa.me` / `whatsapp://send`) caso não haja gateway
   configurado.
3. **Comando de voz via Alexa** — uma Custom Skill na AWS traduz a fala em
   uma intent estruturada, que chega ao app via bridge (WebSocket ou
   webhook) e reaproveita o mesmo pipeline "contato → WhatsApp" usado no
   gatilho de queda.

### Para quem é

- Familiares/cuidadores de idosos ou pessoas com mobilidade reduzida.
- Pessoas que moram sozinhas e querem uma rede de segurança passiva.
- Times de saúde/assistência que queiram embarcar telemetria comportamental
  simples (postura, inquietação, humor) num app maior.

---

## 2. Como usar

### 2.1 Mockup web (`zelo-mockup.html`) — para explorar o conceito agora

Não precisa instalar nada. Abra o arquivo `.html` em qualquer navegador
moderno (Chrome, Safari, Edge).

1. **Aba Monitor** — permita o acesso à câmera (opcional; o resto funciona
   sem ela). Use os chips "Em pé / Sentado / Deitado" e "Neutro / Alegria /
   Surpresa" para forçar manualmente os valores do HUD. Clique em
   **"Simular queda"** para ver a máquina de estados: banner amarelo de
   atenção → barra de progresso de 3s → banner vermelho de emergência →
   evento registrado no log com o link `wa.me` pronto para abrir.
2. **Aba Contatos** — cadastre, edite e exclua contatos; marque um ou mais
   como "primário" (são os que recebem o alerta automático de queda).
3. **Aba Config** — escolha um provedor de gateway (apenas visual no
   mockup) e teste o parser de comando de voz digitando algo como
   `"avisar a Maria que cheguei"`.
4. **Aba Eventos** — histórico de tudo que foi disparado na sessão.

> O mockup é um protótipo de fluxo/UI. A visão computacional é simulada
> (não há inferência de pose real rodando no navegador) — veja a seção de
> limitações abaixo.

### 2.2 App mobile (`vision-emergency-mvp.zip`) — para rodar de verdade

```bash
unzip vision-emergency-mvp.zip && cd app
npm install
cd ios && pod install && cd ..     # apenas iOS
npm run android                    # ou: npm run ios
```

Passos obrigatórios antes de rodar (detalhados no `README.md` interno do
zip):

1. Baixar/converter os modelos `pose_landmark.tflite` e
   `face_landmark.tflite` e colocá-los em `assets/models/`.
2. Adicionar as fontes `RobotoMono-Regular.ttf` / `RobotoMono-Bold.ttf` em
   `assets/fonts/` (usadas pelo HUD em Skia).
3. Configurar permissões nativas: `NSCameraUsageDescription` (iOS),
   `CAMERA`/`INTERNET` (Android), e `LSApplicationQueriesSchemes` /
   `<queries>` para o deep link do WhatsApp funcionar.
4. Abrir o app → aba **Config** → informar o gateway de WhatsApp (ou deixar
   em branco para usar só o fallback de deep link) e, opcionalmente, a URL
   do bridge WebSocket da Alexa.
5. Abrir o app → aba **Contatos** → cadastrar pelo menos um contato
   marcado como "primário" (é quem recebe o alerta automático de queda).
6. Abrir o app → aba **Monitor** → conceder permissão de câmera. A partir
   daí o pipeline roda em segundo plano automaticamente.

---

## 3. Dependências

### 3.1 App mobile (React Native)

| Categoria | Biblioteca | Papel |
|---|---|---|
| Câmera / frames | `react-native-vision-camera` | Captura em tempo real + frame processors |
| Inferência ML | `react-native-fast-tflite` | Roda os modelos `.tflite` on-device |
| Resize de frame | `vision-camera-resize-plugin` | Prepara o frame no tamanho de entrada do modelo |
| Animação/threads | `react-native-reanimated`, `react-native-worklets-core` | Worklets de alta performance na thread de câmera |
| Renderização HUD | `@shopify/react-native-skia` | Overlay gráfico a 60fps |
| Estado/persistência | `zustand`, `@react-native-async-storage/async-storage` | Store de contatos persistido |
| Rede | `axios`, `socket.io-client` | Chamadas ao gateway WhatsApp e bridge da Alexa |
| Navegação | `@react-navigation/native`, `@react-navigation/bottom-tabs` | Tabs Monitor / Contatos / Config |
| Utilitário | `uuid`, `react-native-get-random-values` | IDs de contato |

Requisitos de ambiente: Node ≥ 18, React Native CLI (ou Expo Bare
Workflow/Dev Client — **não** funciona no Expo Go padrão, pois os frame
processors e o TFLite exigem módulos nativos compilados), Xcode (iOS) e
Android Studio/SDK (Android).

Serviços externos (não incluídos, você precisa configurar):
- Uma conta em Evolution API, Z-API **ou** WhatsApp Cloud API oficial.
- Uma Alexa Custom Skill + AWS Lambda + um servidor WebSocket (ou endpoint
  REST) que sirva de bridge entre a Lambda e o app.

### 3.2 Mockup web

Zero dependências externas — HTML, CSS e JavaScript puro em um único
arquivo. Requer apenas um navegador moderno com suporte a `getUserMedia`
(opcional) e JavaScript habilitado.

---

## 4. Limitações conhecidas do MVP atual

- Os limiares de detecção de postura/queda/emoção em `poseUtils.ts` são
  heurísticos (ângulos e razões geométricas calibrados de forma genérica)
  — precisam de validação com dados reais antes de qualquer uso em
  produção, especialmente para diferentes distâncias/ângulos de câmera e
  diferentes biotipos.
- Não há nenhuma camada de autenticação/autorização no bridge da Alexa
  nem no gateway de WhatsApp além do token simples — inadequado para
  produção sem reforço de segurança.
- O disparo de emergência não possui confirmação humana ("é uma queda de
  verdade?") nem escalonamento (ex: tentar contato 1, se não responder em
  X minutos, tentar contato 2).
- Sem persistência de histórico de eventos no app mobile (o log existe
  apenas no mockup web, em memória).
- O mockup web simula a visão computacional; não há inferência de pose
  real rodando no navegador.

---

## 5. Sugestões para evoluir

### Curto prazo (endurecer o MVP)
- **Calibração real dos limiares**: coletar um dataset próprio (voluntários
  simulando quedas/posturas em diferentes condições) e ajustar
  `FALL_VELOCITY_THRESHOLD`, `FALL_TRUNK_ANGLE_THRESHOLD` etc. com base em
  métricas de precisão/recall, não em valores empíricos fixos.
- **Confirmação em duas etapas**: ao detectar queda, mostrar um countdown
  local (com som/vibração) permitindo à pessoa cancelar o alerta antes do
  disparo — reduz falsos positivos sem perder a resposta automática.
- **Persistência do histórico de eventos** no app mobile (AsyncStorage ou
  SQLite), com tela dedicada de "Eventos" espelhando a do mockup web.
- **Testes automatizados** das funções puras de `poseUtils.ts` (são
  worklet-safe e sem I/O, logo fáceis de testar isoladamente com Jest).

### Médio prazo (robustez de produto)
- **Escalonamento de contatos**: se o primeiro contato primário não
  confirmar recebimento/leitura em N minutos, notificar o próximo da
  lista automaticamente.
- **Modo "sem movimento" complementar à queda**: alertar também quando a
  pessoa fica imóvel por tempo anormal em qualquer postura (não só após
  detectar queda), útil para desmaios sem impacto brusco.
- **Autenticação real no bridge da Alexa**: trocar o token simples por
  OAuth/JWT de curta duração, e validar assinatura das requisições vindas
  da AWS Lambda.
- **Modo multiusuário/multi-dispositivo**: permitir que um cuidador
  monitore vários dispositivos/pessoas a partir de um único painel.
- **Wearable companion**: complementar a visão computacional com um
  acelerômetro de pulso/relógio para cruzar sinais e reduzir falsos
  positivos/negativos (ex: quando a pessoa está fora do campo de visão da
  câmera).

### Longo prazo (diferenciação)
- **Modelo de emoção mais robusto**: substituir a heurística geométrica
  (razões labiais/sobrancelha) por um classificador leve treinado
  especificamente, mantendo a inferência on-device.
- **Detecção de múltiplas pessoas em cena**, útil em ambientes
  compartilhados (ex: instituições de longa permanência).
- **Modo "central de monitoramento"**: dashboard web para equipes de
  cuidado acompanharem múltiplos usuários simultaneamente, com métricas
  agregadas de bem-estar (não vídeo bruto — apenas os estados derivados,
  preservando privacidade).
- **Integração com serviços de emergência reais** (ex: SAMU/192 no
  Brasil) como camada adicional ao WhatsApp, mediante consentimento
  explícito do usuário.
- **MediaPipe Tasks Vision via WASM no mockup web**: rodar pose estimation
  real no navegador (sem backend), tornando o protótipo web funcionalmente
  equivalente ao app nativo para fins de demonstração.

---

## 6. Estrutura de decisão do fluxo de emergência

```
                 ┌─────────────────────────┐
                 │   Câmera (tempo real)    │
                 └────────────┬─────────────┘
                              │ frames
                              ▼
                 ┌─────────────────────────┐
                 │ Inferência on-device      │
                 │ (pose + face mesh)        │
                 └────────────┬─────────────┘
                              │ landmarks
                              ▼
      ┌───────────────────────────────────────────┐
      │  Motor cinemático (poseUtils.ts)            │
      │  postura · movimento · emoção · queda        │
      └───────────────────┬───────────────────────┘
                           │ queda sustentada > 3s
                           ▼
      ┌───────────────────────────────────────────┐        ┌──────────────────────┐
      │        runEmergencyRoutine()                │◀───────│  Comando de voz Alexa │
      │  busca contato(s) primário(s) na agenda      │        │  (bridge WebSocket)   │
      └───────────────────┬───────────────────────┘        └──────────────────────┘
                           │
                           ▼
      ┌───────────────────────────────────────────┐
      │            whatsappService.ts                │
      │  gateway HTTP (Evolution/Z-API/Cloud API)     │
      │  ↳ fallback: deep link whatsapp://send        │
      └───────────────────────────────────────────┘
```

Essa é a peça central do MVP: **uma única rotina de emergência** é
compartilhada entre o gatilho automático (visão computacional) e o gatilho
manual/por voz (Alexa), garantindo que qualquer melhoria futura na lógica
de envio (retry, escalonamento, confirmação) beneficie os dois caminhos ao
mesmo tempo.
