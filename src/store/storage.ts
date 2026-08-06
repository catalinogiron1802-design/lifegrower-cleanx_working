import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifegrower_items';
const FOLDERS_KEY = 'lifegrower_folders';

export type MediaType = 'video' | 'photo';

export interface MediaItem {
  id: string;
  type: MediaType;
  uri: string;           // local file URI
  title: string;
  note: string;          // the user's personal thought / reflection
  tags: string[];
  folderId: string | null; // which folder this item belongs to (null = uncategorized)
  comprehended: boolean; // marked as understood
  createdAt: number;
  updatedAt: number;
  watchCount: number;    // how many times watched/viewed
  lastWatchedAt?: number;
  thumbnailUri?: string; // generated thumbnail for video cards
  hidden: boolean;       // hidden from main view; accessible via Hidden folder
  archived: boolean;     // archived; accessible via Archive folder
}

export interface Folder {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
}

export const Storage = {
  async getAll(): Promise<MediaItem[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const items: MediaItem[] = JSON.parse(raw);
      return items.map(i => ({
        folderId: null,
        hidden: false,
        archived: false,
        ...i,
      }));
    } catch {
      return [];
    }
  },

  async save(items: MediaItem[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  },

  async addItem(item: MediaItem): Promise<void> {
    const all = await this.getAll();
    await this.save([item, ...all]);
  },

  async updateItem(id: string, updates: Partial<MediaItem>): Promise<void> {
    const all = await this.getAll();
    const updated = all.map(i =>
      i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i
    );
    await this.save(updated);
  },

  async deleteItem(id: string): Promise<void> {
    const all = await this.getAll();
    await this.save(all.filter(i => i.id !== id));
  },

  async bulkDelete(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const all = await this.getAll();
    await this.save(all.filter(i => !idSet.has(i.id)));
  },

  async bulkUpdate(ids: string[], updates: Partial<MediaItem>): Promise<void> {
    const idSet = new Set(ids);
    const all = await this.getAll();
    const updated = all.map(i =>
      idSet.has(i.id) ? { ...i, ...updates, updatedAt: Date.now() } : i
    );
    await this.save(updated);
  },

  async incrementWatchCount(id: string): Promise<void> {
    const all = await this.getAll();
    const updated = all.map(i =>
      i.id === id
        ? { ...i, watchCount: (i.watchCount || 0) + 1, lastWatchedAt: Date.now() }
        : i
    );
    await this.save(updated);
  },
};

export const FolderStorage = {
  async getAll(): Promise<Folder[]> {
    try {
      const raw = await AsyncStorage.getItem(FOLDERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async save(folders: Folder[]): Promise<void> {
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  },

  async addFolder(folder: Folder): Promise<void> {
    const all = await this.getAll();
    await this.save([...all, folder]);
  },

  async deleteFolder(id: string): Promise<void> {
    // Delete the folder and move its items to uncategorized
    const all = await this.getAll();
    await this.save(all.filter(f => f.id !== id));
    const items = await Storage.getAll();
    const updated = items.map(i =>
      i.folderId === id ? { ...i, folderId: null, updatedAt: Date.now() } : i
    );
    await Storage.save(updated);
  },
};
