/**
 * SettingsScreen.tsx
 * ------------------------------------------------------------------------
 * Tela simples para configurar em runtime:
 *  - Gateway de envio de WhatsApp (Evolution API / Z-API / Cloud API)
 *  - URL/token do bridge WebSocket usado pela integração com Alexa
 * Em produção, prefira mover segredos para .env + secure storage; aqui
 * o formulário grava direto no serviço em memória para fins do MVP.
 * ------------------------------------------------------------------------
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { configureWhatsAppGateway } from '@/services/messaging/whatsappService';
import { connectAlexaBridge } from '@/services/voice/alexaIntegrationService';
import type { WhatsAppProvider } from '@/types';

const PROVIDER_OPTIONS: WhatsAppProvider[] = ['EVOLUTION_API', 'Z_API', 'CLOUD_API', 'NENHUM'];

export function SettingsScreen(): React.JSX.Element {
  const [provider, setProvider] = useState<WhatsAppProvider>('NENHUM');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');

  const [alexaWsUrl, setAlexaWsUrl] = useState('');
  const [alexaToken, setAlexaToken] = useState('');

  function handleSaveGateway(): void {
    configureWhatsAppGateway({
      provider,
      baseUrl,
      apiKey,
      instanceId: instanceId || undefined,
      fromPhoneNumberId: phoneNumberId || undefined,
    });
    Alert.alert('Configuração salva', `Gateway ativo: ${provider}`);
  }

  function handleConnectAlexa(): void {
    if (!alexaWsUrl) {
      Alert.alert('URL obrigatória', 'Informe a URL do bridge WebSocket da Alexa.');
      return;
    }
    connectAlexaBridge({ websocketUrl: alexaWsUrl, authToken: alexaToken });
    Alert.alert('Conectando...', 'Tentando conectar ao bridge da Alexa em segundo plano.');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Gateway WhatsApp</Text>
      <View style={styles.chipRow}>
        {PROVIDER_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setProvider(option)}
            style={[styles.chip, provider === option && styles.chipSelected]}
          >
            <Text style={[styles.chipText, provider === option && styles.chipTextSelected]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Base URL (ex: https://sua-evolution-api.com)"
        placeholderTextColor="#888"
        autoCapitalize="none"
        value={baseUrl}
        onChangeText={setBaseUrl}
      />
      <TextInput
        style={styles.input}
        placeholder="API Key / Token"
        placeholderTextColor="#888"
        autoCapitalize="none"
        secureTextEntry
        value={apiKey}
        onChangeText={setApiKey}
      />
      <TextInput
        style={styles.input}
        placeholder="Instance ID (Evolution/Z-API)"
        placeholderTextColor="#888"
        autoCapitalize="none"
        value={instanceId}
        onChangeText={setInstanceId}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone Number ID (Cloud API oficial)"
        placeholderTextColor="#888"
        autoCapitalize="none"
        value={phoneNumberId}
        onChangeText={setPhoneNumberId}
      />

      <Pressable style={styles.button} onPress={handleSaveGateway}>
        <Text style={styles.buttonText}>Salvar gateway</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Bridge Alexa (WebSocket)</Text>
      <TextInput
        style={styles.input}
        placeholder="wss://seu-bridge-alexa.com/socket"
        placeholderTextColor="#888"
        autoCapitalize="none"
        value={alexaWsUrl}
        onChangeText={setAlexaWsUrl}
      />
      <TextInput
        style={styles.input}
        placeholder="Token de autenticação do dispositivo"
        placeholderTextColor="#888"
        autoCapitalize="none"
        secureTextEntry
        value={alexaToken}
        onChangeText={setAlexaToken}
      />
      <Pressable style={styles.button} onPress={handleConnectAlexa}>
        <Text style={styles.buttonText}>Conectar bridge Alexa</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14' },
  content: { padding: 16, paddingBottom: 48 },
  sectionTitle: { color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sectionSpacing: { marginTop: 28 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#151B23',
    borderWidth: 1,
    borderColor: '#232B36',
  },
  chipSelected: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  chipText: { color: '#AAB4C0', fontSize: 12 },
  chipTextSelected: { color: 'white', fontWeight: '600' },
  input: {
    backgroundColor: '#151B23',
    color: 'white',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#232B36',
  },
  button: {
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: 'white', fontWeight: '700' },
});
