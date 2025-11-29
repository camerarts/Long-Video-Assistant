
import { ProjectData, PromptTemplate, DEFAULT_PROMPTS, ProjectStatus } from '../types';

// API Endpoints
const API_BASE = '/api';

export const getProjects = async (): Promise<ProjectData[]> => {
  try {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return await res.json();
  } catch (error) {
    console.error("API Error:", error);
    return [];
  }
};

export const getProject = async (id: string): Promise<ProjectData | undefined> => {
  try {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error('Failed to fetch project');
    return await res.json();
  } catch (error) {
    console.error("API Error:", error);
    return undefined;
  }
};

export const saveProject = async (project: ProjectData): Promise<void> => {
  const payload = {
    ...project,
    updatedAt: Date.now()
  };
  
  try {
    await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("API Save Error:", error);
    // Optional: Fallback to localstorage or offline queue could go here
  }
};

// Note: Create is now async because we might want to ensure backend knows about it, 
// but for UX speed, we generate ID client side and save async.
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
  try {
    await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
  } catch (error) {
    console.error("API Delete Error:", error);
  }
};

export const getPrompts = async (): Promise<Record<string, PromptTemplate>> => {
  try {
    const res = await fetch(`${API_BASE}/prompts`);
    if (!res.ok) throw new Error('Failed to fetch prompts');
    const stored = await res.json();
    
    if (!stored) return DEFAULT_PROMPTS;
    return { ...DEFAULT_PROMPTS, ...stored };
  } catch (error) {
    console.error("API Prompts Error:", error);
    return DEFAULT_PROMPTS;
  }
};

export const savePrompts = async (prompts: Record<string, PromptTemplate>): Promise<void> => {
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
  // We can just save the defaults to reset
  await savePrompts(DEFAULT_PROMPTS);
};
