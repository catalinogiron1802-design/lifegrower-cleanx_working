import AsyncStorage from '@react-native-async-storage/async-storage';

const THREADS_KEY = 'lifegrower_threads';

export interface Thread {
  id: string;
  title: string;
  caption: string;
  photoUris: string[]; // permanent documentDirectory URIs, in display/carousel order
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export function generateThreadId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export const ThreadStorage = {
  async getAll(): Promise<Thread[]> {
    try {
      const raw = await AsyncStorage.getItem(THREADS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async save(threads: Thread[]): Promise<void> {
    await AsyncStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  },

  async addThread(thread: Thread): Promise<void> {
    const all = await this.getAll();
    await this.save([thread, ...all]); // newest first
  },

  async updateThread(id: string, updates: Partial<Thread>): Promise<void> {
    const all = await this.getAll();
    const updated = all.map(t =>
      t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
    );
    await this.save(updated);
  },

  async deleteThread(id: string): Promise<void> {
    const all = await this.getAll();
    await this.save(all.filter(t => t.id !== id));
  },
};
