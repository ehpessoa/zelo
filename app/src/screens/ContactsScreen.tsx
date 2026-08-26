/**
 * ContactsScreen.tsx
 * ------------------------------------------------------------------------
 * CRUD simples de contatos de emergência/notificação, persistidos via
 * zustand + AsyncStorage (contactsStore). Inclui formulário de
 * cadastro/edição inline e lista com ações de editar/excluir.
 * ------------------------------------------------------------------------
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Pressable,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useContactsStore, type NewContactInput } from '@/state/contactsStore';
import type { ContactRelation, EmergencyContact } from '@/types';
import { toFullPhone } from '@/types';

const RELATION_OPTIONS: { value: ContactRelation; label: string }[] = [
  { value: 'FAMILIAR', label: 'Familiar' },
  { value: 'CONJUGE', label: 'Cônjuge' },
  { value: 'FILHO_FILHA', label: 'Filho(a)' },
  { value: 'CUIDADOR', label: 'Cuidador(a)' },
  { value: 'AMIGO', label: 'Amigo(a)' },
  { value: 'MEDICO', label: 'Médico(a)' },
  { value: 'OUTRO', label: 'Outro' },
];

const EMPTY_FORM: NewContactInput = {
  name: '',
  ddi: '55',
  ddd: '',
  phoneNumber: '',
  relation: 'FAMILIAR',
  isPrimaryEmergencyContact: false,
};

export function ContactsScreen(): React.JSX.Element {
  const contacts = useContactsStore((state) => state.contacts);
  const addContact = useContactsStore((state) => state.addContact);
  const updateContact = useContactsStore((state) => state.updateContact);
  const removeContact = useContactsStore((state) => state.removeContact);

  const [form, setForm] = useState<NewContactInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isEditing = editingId !== null;

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) => {
        if (a.isPrimaryEmergencyContact !== b.isPrimaryEmergencyContact) {
          return a.isPrimaryEmergencyContact ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    [contacts],
  );

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function handleSubmit(): void {
    if (!form.name.trim() || !form.ddd.trim() || !form.phoneNumber.trim()) {
      Alert.alert('Campos obrigatórios', 'Preencha nome, DDD e telefone.');
      return;
    }

    if (isEditing && editingId) {
      updateContact(editingId, form);
    } else {
      addContact(form);
    }
    resetForm();
  }

  function handleEdit(contact: EmergencyContact): void {
    setEditingId(contact.id);
    setForm({
      name: contact.name,
      ddi: contact.ddi,
      ddd: contact.ddd,
      phoneNumber: contact.phoneNumber,
      relation: contact.relation,
      isPrimaryEmergencyContact: contact.isPrimaryEmergencyContact,
    });
  }

  function handleDelete(contact: EmergencyContact): void {
    Alert.alert('Excluir contato', `Remover "${contact.name}" da agenda?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          removeContact(contact.id);
          if (editingId === contact.id) resetForm();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={sortedContacts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <ContactForm
            form={form}
            isEditing={isEditing}
            onChange={setForm}
            onSubmit={handleSubmit}
            onCancelEdit={resetForm}
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhum contato cadastrado ainda.</Text>
        }
        renderItem={({ item }) => (
          <ContactListItem
            contact={item}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </KeyboardAvoidingView>
  );
}

// ----------------------------------------------------------------------------
// Subcomponentes
// ----------------------------------------------------------------------------

interface ContactFormProps {
  form: NewContactInput;
  isEditing: boolean;
  onChange: (form: NewContactInput) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
}

function ContactForm({ form, isEditing, onChange, onSubmit, onCancelEdit }: ContactFormProps) {
  const patch = (fields: Partial<NewContactInput>) => onChange({ ...form, ...fields });

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>{isEditing ? 'Editar contato' : 'Novo contato'}</Text>

      <TextInput
        style={styles.input}
        placeholder="Nome completo"
        placeholderTextColor="#888"
        value={form.name}
        onChangeText={(name) => patch({ name })}
      />

      <View style={styles.phoneRow}>
        <TextInput
          style={[styles.input, styles.phoneInputSmall]}
          placeholder="DDI"
          placeholderTextColor="#888"
          keyboardType="number-pad"
          maxLength={3}
          value={form.ddi}
          onChangeText={(ddi) => patch({ ddi })}
        />
        <TextInput
          style={[styles.input, styles.phoneInputSmall]}
          placeholder="DDD"
          placeholderTextColor="#888"
          keyboardType="number-pad"
          maxLength={2}
          value={form.ddd}
          onChangeText={(ddd) => patch({ ddd })}
        />
        <TextInput
          style={[styles.input, styles.phoneInputLarge]}
          placeholder="Número"
          placeholderTextColor="#888"
          keyboardType="number-pad"
          maxLength={9}
          value={form.phoneNumber}
          onChangeText={(phoneNumber) => patch({ phoneNumber })}
        />
      </View>

      <View style={styles.relationRow}>
        {RELATION_OPTIONS.map((option) => {
          const isSelected = form.relation === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => patch({ relation: option.value })}
              style={[styles.relationChip, isSelected && styles.relationChipSelected]}
            >
              <Text style={[styles.relationChipText, isSelected && styles.relationChipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Contato de emergência primário</Text>
        <Switch
          value={form.isPrimaryEmergencyContact}
          onValueChange={(isPrimaryEmergencyContact) => patch({ isPrimaryEmergencyContact })}
        />
      </View>

      <View style={styles.formActions}>
        {isEditing && (
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onCancelEdit}>
            <Text style={styles.buttonSecondaryText}>Cancelar</Text>
          </Pressable>
        )}
        <Pressable style={[styles.button, styles.buttonPrimary]} onPress={onSubmit}>
          <Text style={styles.buttonPrimaryText}>{isEditing ? 'Salvar alterações' : 'Adicionar contato'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface ContactListItemProps {
  contact: EmergencyContact;
  onEdit: () => void;
  onDelete: () => void;
}

function ContactListItem({ contact, onEdit, onDelete }: ContactListItemProps) {
  const relationLabel =
    RELATION_OPTIONS.find((option) => option.value === contact.relation)?.label ?? contact.relation;

  return (
    <View style={styles.listItem}>
      <View style={styles.listItemInfo}>
        <View style={styles.listItemNameRow}>
          <Text style={styles.listItemName}>{contact.name}</Text>
          {contact.isPrimaryEmergencyContact && <Text style={styles.primaryBadge}>PRIMÁRIO</Text>}
        </View>
        <Text style={styles.listItemPhone}>+{toFullPhone(contact)}</Text>
        <Text style={styles.listItemRelation}>{relationLabel}</Text>
      </View>
      <View style={styles.listItemActions}>
        <Pressable onPress={onEdit} style={styles.iconButton}>
          <Text style={styles.iconButtonText}>Editar</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.iconButton}>
          <Text style={[styles.iconButtonText, styles.deleteText]}>Excluir</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Estilos
// ----------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14' },
  listContent: { padding: 16, paddingBottom: 48 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 24 },

  formCard: {
    backgroundColor: '#151B23',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  formTitle: { color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: {
    backgroundColor: '#0B0F14',
    color: 'white',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#232B36',
  },
  phoneRow: { flexDirection: 'row', gap: 8 },
  phoneInputSmall: { flex: 1 },
  phoneInputLarge: { flex: 2 },

  relationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 12 },
  relationChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0B0F14',
    borderWidth: 1,
    borderColor: '#232B36',
  },
  relationChipSelected: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  relationChipText: { color: '#AAB4C0', fontSize: 12 },
  relationChipTextSelected: { color: 'white', fontWeight: '600' },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: { color: '#CCD3DB', fontSize: 14 },

  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  buttonPrimary: { backgroundColor: '#1D4ED8' },
  buttonPrimaryText: { color: 'white', fontWeight: '700' },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#232B36' },
  buttonSecondaryText: { color: '#AAB4C0' },

  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#151B23',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  listItemInfo: { flex: 1 },
  listItemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listItemName: { color: 'white', fontSize: 15, fontWeight: '600' },
  primaryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  listItemPhone: { color: '#AAB4C0', fontSize: 13, marginTop: 2 },
  listItemRelation: { color: '#6B7684', fontSize: 12, marginTop: 2 },

  listItemActions: { alignItems: 'flex-end', gap: 6 },
  iconButton: { paddingHorizontal: 8, paddingVertical: 4 },
  iconButtonText: { color: '#60A5FA', fontSize: 13 },
  deleteText: { color: '#F87171' },
});
