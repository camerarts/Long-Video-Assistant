
import { ProjectData, PromptTemplate, DEFAULT_PROMPTS, ProjectStatus } from '../types';

// API Endpoints
const API_BASE = '/api';
const LOCAL_KEY_PROJECTS = 'lva_projects';
const LOCAL_KEY_PROMPTS = 'lva_prompts';

// --- LocalStorage Helpers ---

const getLocalProjects = (): ProjectData[] => {
  try {
    const data = localStorage.getItem(LOCAL_KEY_PROJECTS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.warn("LocalStorage Read Error", e);
    return [];
  }
};

const saveLocalProjects = (projects: ProjectData[]) => {
  try {
    localStorage.setItem(LOCAL_KEY_PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.warn("LocalStorage Write Error", e);
  }
};

// --- Service Methods ---

export const getProjects = async (): Promise<ProjectData[]> => {
  // Strategy: Optimistic. Return LocalStorage if API fails.
  try {
    const res = await fetch(`${API_BASE}/projects`);
    if (res.ok) {
      const data = await res.json();
      // Sync API data down to local
      saveLocalProjects(data);
      return data;
    } else {
      console.warn(`API getProjects failed with ${res.status}, falling back to local.`);
      return getLocalProjects();
    }
  } catch (error) {
    console.warn("API Unavailable (getProjects), using LocalStorage fallback.");
    return getLocalProjects();
  }
};

export const getProject = async (id: string): Promise<ProjectData | undefined> => {
  // Strategy: Try API first, fallback to LocalStorage
  try {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.warn("API Unavailable (getProject), using LocalStorage fallback.");
  }
  
  // Fallback
  const projects = getLocalProjects();
  return projects.find(p => p.id === id);
};

export const saveProject = async (project: ProjectData): Promise<void> => {
  const payload = {
    ...project,
    updatedAt: Date.now()
  };
  
  // 1. Local Update (Always succeeds immediately)
  const projects = getLocalProjects();
  const index = projects.findIndex(p => p.id === payload.id);
  if (index >= 0) {
    projects[index] = payload;
  } else {
    projects.push(payload);
  }
  saveLocalProjects(projects);

  // 2. API Update (Background Sync)
  try {
    await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    // We suppress the error here because we've already saved locally.
    // The user doesn't need to know the sync failed, it will sync next time.
    console.warn("API Save Failed (Offline mode active):", error);
  }
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
  // 1. Local Delete
  const projects = getLocalProjects();
  const filtered = projects.filter(p => p.id !== id);
  saveLocalProjects(filtered);

  // 2. API Delete
  try {
    await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
  } catch (error) {
    console.error("API Delete Error:", error);
  }
};

export const getPrompts = async (): Promise<Record<string, PromptTemplate>> => {
  // Strategy: API -> Local -> Defaults
  try {
    const res = await fetch(`${API_BASE}/prompts`);
    if (res.ok) {
      const stored = await res.json();
      if (stored) {
        localStorage.setItem(LOCAL_KEY_PROMPTS, JSON.stringify(stored));
        return { ...DEFAULT_PROMPTS, ...stored };
      }
    }
  } catch (error) {
    console.warn("API Unavailable (getPrompts), checking local.");
  }

  // Fallback to local
  try {
    const local = localStorage.getItem(LOCAL_KEY_PROMPTS);
    if (local) {
      return { ...DEFAULT_PROMPTS, ...JSON.parse(local) };
    }
  } catch (e) { /* ignore */ }

  return DEFAULT_PROMPTS;
};

export const savePrompts = async (prompts: Record<string, PromptTemplate>): Promise<void> => {
  // 1. Local Save
  localStorage.setItem(LOCAL_KEY_PROMPTS, JSON.stringify(prompts));

  // 2. API Save
  try {
    await fetch(`${API_BASE}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompts)
    });
  } catch (error) {
    console.error("API Save Prompts Error:", error);
  }
};

export const resetPrompts = async (): Promise<void> => {
  await savePrompts(DEFAULT_PROMPTS);
};
