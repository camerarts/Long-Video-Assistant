
import { ProjectData, PromptTemplate, DEFAULT_PROMPTS, ProjectStatus, Inspiration } from '../types';

// API Endpoints
const API_BASE = '/api';
const DB_NAME = 'LVA_DB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_INSPIRATIONS = 'inspirations';
const KEY_PROMPTS = 'lva_prompts'; // Keep prompts in LocalStorage as they are small settings

// --- IndexedDB Helpers ---

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_INSPIRATIONS)) {
        db.createObjectStore(STORE_INSPIRATIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

const dbGetAll = async <T>(storeName: string): Promise<T[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
};

const dbGet = async <T>(storeName: string, key: string): Promise<T | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
};

const dbPut = async <T>(storeName: string, value: T): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const dbDelete = async (storeName: string, key: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- Mutex for Atomic Updates ---
// Since IDB is async, we need a lock to prevent read-modify-write race conditions.
class Mutex {
  private queue: Promise<void> = Promise.resolve();

  async lock<T>(task: () => Promise<T>): Promise<T> {
    let release: () => void;
    const currentLock = new Promise<void>(resolve => { release = resolve; });
    
    // Wait for previous task
    const previous = this.queue;
    // Update queue to wait for this task
    this.queue = this.queue.then(() => currentLock);

    await previous;
    
    try {
      return await task();
    } finally {
      release!();
    }
  }
}

const projectMutex = new Mutex();

// --- Service Methods ---

export const getProjects = async (): Promise<ProjectData[]> => {
  // Strategy: ALWAYS fetch from API to ensure sync across devices.
  // Merge server data into local IDB, then return local IDB content.
  try {
    try {
        const res = await fetch(`${API_BASE}/projects`);
        if (res.ok) {
            const apiData = await res.json();
            // Sync to IDB
            for (const p of apiData) await dbPut(STORE_PROJECTS, p);
        }
    } catch (e) { 
        console.warn("Project sync failed, falling back to local data", e);
    }
    
    return await dbGetAll<ProjectData>(STORE_PROJECTS);
  } catch (error) {
    console.error("DB Error", error);
    return [];
  }
};

export const getProject = async (id: string): Promise<ProjectData | undefined> => {
  // Try IDB first for speed
  try {
    const project = await dbGet<ProjectData>(STORE_PROJECTS, id);
    if (project) return project;
  } catch (e) { /* ignore */ }

  // Fallback API
  try {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (res.ok) {
      const project = await res.json();
      await dbPut(STORE_PROJECTS, project);
      return project;
    }
  } catch (error) { /* ignore */ }
  
  return undefined;
};

export const saveProject = async (project: ProjectData): Promise<void> => {
  const payload = {
    ...project,
    updatedAt: Date.now()
  };
  
  // 1. IDB Update
  await dbPut(STORE_PROJECTS, payload);

  // 2. API Update (Background)
  try {
    await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.warn("Background API Sync Failed:", error);
  }
};

/**
 * Atomic Update: Ensures that concurrent updates don't overwrite each other.
 * Essential for parallel AI generation tasks.
 * NOW WITH MUTEX for Async Storage.
 */
export const updateProject = async (id: string, updater: (current: ProjectData) => ProjectData): Promise<ProjectData | null> => {
  return projectMutex.lock(async () => {
      // 1. Read fresh from IDB
      const current = await dbGet<ProjectData>(STORE_PROJECTS, id);
      
      if (!current) return null;

      // 2. Apply Update
      const updated = updater(current);
      updated.updatedAt = Date.now();
      
      // 3. Save back
      await dbPut(STORE_PROJECTS, updated);

      // 4. Fire API sync in background (fire and forget)
      fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      }).catch(e => console.warn("Background sync failed", e));

      return updated;
  });
};

export const createProject = async (): Promise<string> => {
  const newProject: ProjectData = {
    id: crypto.randomUUID(),
    title: '未命名项目',
    status: ProjectStatus.DRAFT,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    inputs: {
      topic: '',
      corePoint: '',
      audience: '大众',
      duration: '10分钟',
      tone: '信息丰富且引人入胜',
      language: '中文'
    }
  };
  
  await saveProject(newProject);
  return newProject.id;
};

export const deleteProject = async (id: string): Promise<void> => {
  await dbDelete(STORE_PROJECTS, id);

  try {
    await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
  } catch (error) {
    console.warn("API Delete Failed:", error);
  }
};

// --- Prompts (Sync to API + LocalStorage) ---

export const getPrompts = async (): Promise<Record<string, PromptTemplate>> => {
  // 1. Try fetch from API
  try {
    const res = await fetch(`${API_BASE}/prompts`);
    if (res.ok) {
        const serverPrompts = await res.json();
        if (serverPrompts) {
             const merged = { ...DEFAULT_PROMPTS, ...serverPrompts };
             localStorage.setItem(KEY_PROMPTS, JSON.stringify(merged));
             return merged;
        }
    }
  } catch (e) { /* ignore */ }

  // 2. Fallback to local
  try {
    const local = localStorage.getItem(KEY_PROMPTS);
    if (local) {
      return { ...DEFAULT_PROMPTS, ...JSON.parse(local) };
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_PROMPTS;
};

export const savePrompts = async (prompts: Record<string, PromptTemplate>): Promise<void> => {
  // Save local
  localStorage.setItem(KEY_PROMPTS, JSON.stringify(prompts));
  // Save remote
  try {
    await fetch(`${API_BASE}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompts)
    });
  } catch (e) {
      console.warn("Failed to sync prompts to server", e);
  }
};

export const resetPrompts = async (): Promise<void> => {
  await savePrompts(DEFAULT_PROMPTS);
};

// --- Inspiration Methods (Migrated to IDB + Sync) ---

export const getInspirations = async (): Promise<Inspiration[]> => {
  try {
    // Always sync from server
    try {
        const res = await fetch(`${API_BASE}/inspirations`);
        if (res.ok) {
            const apiData = await res.json();
            for (const item of apiData) await dbPut(STORE_INSPIRATIONS, item);
        }
    } catch (e) { /* ignore */ }

    return await dbGetAll<Inspiration>(STORE_INSPIRATIONS);
  } catch (e) {
    return [];
  }
};

export const saveInspiration = async (item: Inspiration): Promise<void> => {
  await dbPut(STORE_INSPIRATIONS, item);
  try {
    await fetch(`${API_BASE}/inspirations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
  } catch (e) {}
};

export const deleteInspiration = async (id: string): Promise<void> => {
  await dbDelete(STORE_INSPIRATIONS, id);
  try {
    await fetch(`${API_BASE}/inspirations/${id}`, { method: 'DELETE' });
  } catch (e) {}
};
