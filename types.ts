
export enum ProjectStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED'
}

export interface StoryboardFrame {
  id: string;
  sceneNumber: number;
  description: string;
  imageUrl?: string; // Base64 or URL
  imagePrompt?: string;
}

export interface ProjectData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: ProjectStatus;
  
  // Inputs
  inputs: {
    topic: string;
    corePoint: string;
    audience: string;
    duration: string;
    tone: string;
    language: string;
  };

  // Outputs
  script?: string;
  storyboard?: StoryboardFrame[];
  titles?: string[];
  summary?: string;
  coverText?: string; // New field for Cover Text Description/Copy
  coverImage?: {
    imageUrl: string;
    title: string;
    prompt: string;
  };
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string; // Uses {{variable}} syntax
  description: string;
}

export const DEFAULT_PROMPTS: Record<string, PromptTemplate> = {
  SCRIPT: {
    id: 'script_gen',
    name: '脚本生成',
    description: '生成完整的视频脚本文案',
    template: `你是一位专业的长视频脚本撰稿人。请为一个视频创作详细的脚本，确保内容深度和逻辑性。
    
主题: {{topic}}
核心观点: {{corePoint}}
目标受众: {{audience}}
目标时长: {{duration}}
语气风格: {{tone}}
语言: {{language}}

请以Markdown格式返回，必须包含以下部分：
1. 引人入胜的开场（Hook）
2. 核心观点阐述
3. 详细的论证或叙事展开（分章节）
4. 强有力的结论与行动号召（Call to Action）`
  },
  STORYBOARD_TEXT: {
    id: 'sb_text',
    name: '分镜文案提取',
    description: '将脚本拆解为可视化的分镜描述',
    template: `作为一个专业的分镜师，请将以下脚本转化为一系列视觉画面描述。每个场景必须是具体的、可拍摄的画面。
    
脚本内容:
{{script}}

请仅返回一个JSON对象数组。每个对象必须包含 "description" 字段，描述该场景的视觉画面（包含主体、动作、环境、光影、镜头角度）。
示例格式：
[
  {"description": "一名年轻男子坐在充满科技感的房间里，面前是发光的全息屏幕，侧面特写，蓝色冷调光"},
  {"description": "繁忙的东京涩谷十字路口，人流穿梭，延时摄影，俯拍视角"}
]
`
  },
  TITLES: {
    id: 'titles',
    name: '标题生成',
    description: '基于脚本生成具有病毒传播潜力的标题',
    template: `请基于以下完整的视频脚本，生成10个具有病毒传播潜力、高点击率的YouTube/B站风格标题。

脚本内容概要：
{{script}}

要求：
1. 标题必须紧扣脚本的核心内容。
2. 要有冲击力，引发好奇心或情感共鸣（可以使用悬念、数字、反差等技巧）。
3. 包含核心关键词。
请以简单的无序列表形式返回，每行一个标题。`
  },
  SUMMARY: {
    id: 'summary',
    name: '视频总结',
    description: '生成视频简介和标签',
    template: `请为以下脚本撰写一段适合发布在YouTube/B站的视频简介（Description）和标签（Tags）。
    
脚本内容:
{{script}}

格式要求：
1. 视频简介（200字以内，概括核心价值）
2. 时间戳（基于脚本结构估算）
3. 相关标签（Hashtags）`
  },
  IMAGE_GEN: {
    id: 'image_gen',
    name: '图片生成助手',
    description: '图片生成提示词的前缀配置',
    template: `电影感，大师级构图，8k分辨率，极高细节，照片级真实，16:9宽画幅。 {{description}}`
  },
  COVER_GEN: {
    id: 'cover_gen',
    name: '封面文字策划',
    description: '基于脚本内容生成封面方案',
    template: `请基于以下视频脚本，策划一个高点击率的封面（Thumbnail）方案。
    
脚本内容:
{{script}}

请提供 3 个不同的封面方案，每个方案包含：
1. 画面描述（Visual）：详细描述画面主体、背景、表情、动作和色彩氛围。
2. 封面文字（Copy）：封面图片上醒目的大字文案（通常少于8个字，极具冲击力）。

请直接返回文本方案。`
  }
};
