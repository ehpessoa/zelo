/**
 * AppNavigator.tsx
 * ------------------------------------------------------------------------
 * Navegação por abas unificando os três pilares do MVP:
 *   - Monitor: pipeline de visão computacional + HUD (VisionPilotScreen)
 *   - Contatos: agenda de emergência (ContactsScreen)
 *   - Config: gateways de WhatsApp e bridge da Alexa (SettingsScreen)
 * ------------------------------------------------------------------------
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { VisionPilotScreen } from '@/screens/VisionPilotScreen';
import { ContactsScreen } from '@/screens/ContactsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

export type RootTabParamList = {
  Monitor: undefined;
  Contatos: undefined;
  Config: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  Monitor: '👁️',
  Contatos: '📇',
  Config: '⚙️',
};

export function AppNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: '#0B0F14' },
          headerTitleStyle: { color: 'white' },
          tabBarStyle: { backgroundColor: '#0B0F14', borderTopColor: '#232B36' },
          tabBarActiveTintColor: '#60A5FA',
          tabBarInactiveTintColor: '#6B7684',
          tabBarIcon: () => (
            <Text style={{ fontSize: 18 }}>{TAB_ICONS[route.name as keyof RootTabParamList]}</Text>
          ),
        })}
      >
        <Tab.Screen name="Monitor" component={VisionPilotScreen} options={{ title: 'Monitor de Visão' }} />
        <Tab.Screen name="Contatos" component={ContactsScreen} options={{ title: 'Contatos de Emergência' }} />
        <Tab.Screen name="Config" component={SettingsScreen} options={{ title: 'Configurações' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
