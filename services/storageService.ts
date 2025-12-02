
import { ProjectData, PromptTemplate, DEFAULT_PROMPTS, ProjectStatus, Inspiration } from '../types';

// API Endpoints
const API_BASE = '/api';
const DB_NAME = 'LVA_DB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_INSPIRATIONS = 'inspirations';
const KEY_PROMPTS = 'lva_prompts'; 
const KEY_LAST_UPLOAD = 'lva_last_upload_time';

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
class Mutex {
  private queue: Promise<void> = Promise.resolve();

  async lock<T>(task: () => Promise<T>): Promise<T> {
    let release: () => void;
    const currentLock = new Promise<void>(resolve => { release = resolve; });
    
    // Wait for previous task
    const previous = this.queue;
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

// --- Manual Sync Methods ---

export const getLastUploadTime = (): string => {
  const ts = localStorage.getItem(KEY_LAST_UPLOAD);
  if (!ts) return '从未上传';
  const date = new Date(parseInt(ts));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日/${pad(date.getHours())}：${pad(date.getMinutes())}：${pad(date.getSeconds())}`;
};

export const uploadAllData = async (): Promise<void> => {
  // 1. Get all Local Data
  const projects = await dbGetAll<ProjectData>(STORE_PROJECTS);
  const inspirations = await dbGetAll<Inspiration>(STORE_INSPIRATIONS);
  const promptsStr = localStorage.getItem(KEY_PROMPTS);
  const prompts = promptsStr ? JSON.parse(promptsStr) : DEFAULT_PROMPTS;

  // 2. Upload Projects (Iterative)
  // Optimization: In a real app, use a bulk endpoint. Here we reuse existing single endpoints.
  for (const p of projects) {
    await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
  }

  // 3. Upload Inspirations (Iterative)
  for (const i of inspirations) {
    await fetch(`${API_BASE}/inspirations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(i)
    });
  }

  // 4. Upload Prompts (Single)
  await fetch(`${API_BASE}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompts)
  });

  // 5. Update Timestamp
  localStorage.setItem(KEY_LAST_UPLOAD, Date.now().toString());
};

export const downloadAllData = async (): Promise<void> => {
  // 1. Fetch Projects
  try {
    const res = await fetch(`${API_BASE}/projects`);
    if (res.ok) {
        const apiData = await res.json();
        for (const p of apiData) await dbPut(STORE_PROJECTS, p);
    }
  } catch (e) { console.error("Failed to download projects", e); }

  // 2. Fetch Inspirations
  try {
    const res = await fetch(`${API_BASE}/inspirations`);
    if (res.ok) {
        const apiData = await res.json();
        for (const item of apiData) await dbPut(STORE_INSPIRATIONS, item);
    }
  } catch (e) { console.error("Failed to download inspirations", e); }

  // 3. Fetch Prompts
  try {
    const res = await fetch(`${API_BASE}/prompts`);
    if (res.ok) {
        const serverPrompts = await res.json();
        if (serverPrompts) {
             const merged = { ...DEFAULT_PROMPTS, ...serverPrompts };
             localStorage.setItem(KEY_PROMPTS, JSON.stringify(merged));
        }
    }
  } catch (e) { console.error("Failed to download prompts", e); }
};

// --- Local CRUD Methods (No Network) ---

export const getProjects = async (): Promise<ProjectData[]> => {
  try {
    return await dbGetAll<ProjectData>(STORE_PROJECTS);
  } catch (error) {
    console.error("DB Error", error);
    return [];
  }
};

export const getProject = async (id: string): Promise<ProjectData | undefined> => {
  try {
    return await dbGet<ProjectData>(STORE_PROJECTS, id);
  } catch (e) { 
    return undefined;
  }
};

export const saveProject = async (project: ProjectData): Promise<void> => {
  const payload = {
    ...project,
    updatedAt: Date.now()
  };
  await dbPut(STORE_PROJECTS, payload);
};

export const updateProject = async (id: string, updater: (current: ProjectData) => ProjectData): Promise<ProjectData | null> => {
  return projectMutex.lock(async () => {
      const current = await dbGet<ProjectData>(STORE_PROJECTS, id);
      if (!current) return null;

      const updated = updater(current);
      updated.updatedAt = Date.now();
      
      await dbPut(STORE_PROJECTS, updated);
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
};

// --- Prompts (Local Only) ---

export const getPrompts = async (): Promise<Record<string, PromptTemplate>> => {
  try {
    const local = localStorage.getItem(KEY_PROMPTS);
    if (local) {
      return { ...DEFAULT_PROMPTS, ...JSON.parse(local) };
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_PROMPTS;
};

export const savePrompts = async (prompts: Record<string, PromptTemplate>): Promise<void> => {
  localStorage.setItem(KEY_PROMPTS, JSON.stringify(prompts));
};

export const resetPrompts = async (): Promise<void> => {
  await savePrompts(DEFAULT_PROMPTS);
};

// --- Inspiration Methods (Local Only) ---

export const getInspirations = async (): Promise<Inspiration[]> => {
  try {
    return await dbGetAll<Inspiration>(STORE_INSPIRATIONS);
  } catch (e) {
    return [];
  }
};

export const saveInspiration = async (item: Inspiration): Promise<void> => {
  await dbPut(STORE_INSPIRATIONS, item);
};

export const deleteInspiration = async (id: string): Promise<void> => {
  await dbDelete(STORE_INSPIRATIONS, id);
};
