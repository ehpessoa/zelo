import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import type { EmergencyContact, ContactRelation } from '@/types';

interface ContactsState {
  contacts: EmergencyContact[];
  addContact: (input: NewContactInput) => EmergencyContact;
  updateContact: (id: string, patch: Partial<NewContactInput>) => void;
  removeContact: (id: string) => void;
  getContactById: (id: string) => EmergencyContact | undefined;
  /**
   * Busca fuzzy simples por nome, usada pelo alexaIntegrationService para
   * resolver comandos de voz como "avisar a Maria".
   */
  findContactByName: (query: string) => EmergencyContact | undefined;
  getPrimaryEmergencyContacts: () => EmergencyContact[];
}

export interface NewContactInput {
  name: string;
  ddi: string;
  ddd: string;
  phoneNumber: string;
  relation: ContactRelation;
  isPrimaryEmergencyContact: boolean;
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim();

export const useContactsStore = create<ContactsState>()(
  persist(
    (set, get) => ({
      contacts: [],

      addContact: (input) => {
        const now = Date.now();
        const newContact: EmergencyContact = {
          id: uuidv4(),
          createdAt: now,
          updatedAt: now,
          ...input,
        };
        set((state) => ({ contacts: [...state.contacts, newContact] }));
        return newContact;
      },

      updateContact: (id, patch) => {
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
          ),
        }));
      },

      removeContact: (id) => {
        set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) }));
      },

      getContactById: (id) => get().contacts.find((c) => c.id === id),

      findContactByName: (query) => {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return undefined;

        const contacts = get().contacts;

        // 1. Match exato
        const exact = contacts.find((c) => normalize(c.name) === normalizedQuery);
        if (exact) return exact;

        // 2. Match por primeiro nome / substring
        return contacts.find((c) => normalize(c.name).includes(normalizedQuery));
      },

      getPrimaryEmergencyContacts: () =>
        get().contacts.filter((c) => c.isPrimaryEmergencyContact),
    }),
    {
      name: 'vision-mvp/contacts-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
