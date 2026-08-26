/**
 * App.tsx
 * ------------------------------------------------------------------------
 * Ponto de entrada do MVP. Integra:
 *   - Navegação por abas (Monitor / Contatos / Config)
 *   - GestureHandlerRootView (obrigatório p/ react-native-gesture-handler)
 *   - SafeAreaProvider
 *
 * O bridge da Alexa é conectado a partir da tela de Configurações
 * (SettingsScreen) para permitir configurar URL/token em runtime; caso
 * você já tenha uma URL fixa de produção, pode chamar
 * `connectAlexaBridge(...)` diretamente aqui no useEffect de bootstrap.
 * ------------------------------------------------------------------------
 */
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from '@/navigation/AppNavigator';

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F14" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
