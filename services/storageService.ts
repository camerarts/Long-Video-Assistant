import { ProjectData, PromptTemplate, DEFAULT_PROMPTS, ProjectStatus } from '../types';

const PROJECTS_KEY = 'lva_projects';
const PROMPTS_KEY = 'lva_prompts';

export const getProjects = (): ProjectData[] => {
  const data = localStorage.getItem(PROJECTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getProject = (id: string): ProjectData | undefined => {
  const projects = getProjects();
  return projects.find(p => p.id === id);
};

export const saveProject = (project: ProjectData): void => {
  const projects = getProjects();
  const index = projects.findIndex(p => p.id === project.id);
  
  if (index >= 0) {
    projects[index] = { ...project, updatedAt: Date.now() };
  } else {
    projects.push({ ...project, createdAt: Date.now(), updatedAt: Date.now() });
  }
  
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
};

export const createProject = (): string => {
  const newProject: ProjectData = {
    id: crypto.randomUUID(),
    title: '未命名项目',
    status: ProjectStatus.DRAFT,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    inputs: {
      topic: '',
      corePoint: '',
      // Hidden defaults
      audience: '大众',
      duration: '10分钟',
      tone: '信息丰富且引人入胜',
      language: '中文'
    }
  };
  saveProject(newProject);
  return newProject.id;
};

export const deleteProject = (id: string): void => {
  const projects = getProjects();
  const filtered = projects.filter(p => p.id !== id);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered));
};

export const getPrompts = (): Record<string, PromptTemplate> => {
  const data = localStorage.getItem(PROMPTS_KEY);
  if (!data) return DEFAULT_PROMPTS;
  
  // Merge with default to ensure new keys exist if schema updates
  const stored = JSON.parse(data);
  return { ...DEFAULT_PROMPTS, ...stored };
};

export const savePrompts = (prompts: Record<string, PromptTemplate>): void => {
  localStorage.setItem(PROMPTS_KEY, JSON.stringify(prompts));
};

export const resetPrompts = (): void => {
  localStorage.removeItem(PROMPTS_KEY);
};