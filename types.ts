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

export interface TitleItem {
  title: string;
  type: string; // e.g., "悬念型", "数字型"
}

export interface CoverOption {
  visual: string; // Scene description
  copy: string;   // Text on image
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
  titles?: TitleItem[]; // Structured titles
  summary?: string;
  coverText?: string; // Legacy field
  coverOptions?: CoverOption[]; // New structured cover options
  coverImage?: {
    imageUrl: string;
    title: string;
    prompt: string;
  };
}

export interface Inspiration {
  id: string;
  content: string; // Original text/link
  category: string;
  trafficLogic: string;
  viralTitle: string;
  createdAt: number;
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
    name: '视频文案',
    description: '生成完整的视频文案',
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

请仅返回一个纯 JSON 对象数组（不要Markdown格式）。每个对象必须包含 "description" 字段。
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
2. 要有冲击力，引发好奇心或情感共鸣。

请返回一个纯 JSON 数组（不要Markdown格式），数组中每个对象包含两个字段：
- "title": 具体的标题文本
- "type": 标题的类型风格（例如：悬念型、直击痛点、数字盘点、情绪共鸣等）

示例：
[
  {"title": "普通人如何利用AI在30天内赚到第一桶金？", "type": "悬念利益型"},
  {"title": "揭秘OpenAI内部：你不知道的5个真相", "type": "揭秘型"}
]
`
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
    template: `请基于以下视频脚本，策划 3 个高点击率的封面（Thumbnail）方案。
    
脚本内容:
{{script}}

请返回一个纯 JSON 数组（不要Markdown格式），数组中每个对象包含两个字段：
- "visual": 详细的画面描述（包含主体、表情、背景颜色、氛围）。
- "copy": 封面上的醒目大字文案（Copywriting），通常少于8个字，极具冲击力。

示例：
[
  {"visual": "极度震惊的表情特写，背景是燃烧的红色火焰", "copy": "彻底崩盘！"},
  {"visual": "左右分屏对比，左边是贫穷的街道，右边是未来城市", "copy": "逆袭翻身"}
]
`
  },
  INSPIRATION_EXTRACT: {
    id: 'insp_extract',
    name: '灵感提取助手',
    description: '从杂乱文本中提取结构化灵感信息',
    template: `请分析以下灵感文本（可能是一段笔记、文章摘要或视频脚本草稿），并提取关键信息。

灵感文本：
{{content}}

请返回一个纯 JSON 对象（不要Markdown格式），包含以下字段：
- "category": 归属的视频赛道/类目（例如：科技数码、商业思维、生活Vlog、情感励志等）。
- "trafficLogic": 分析这个选题为什么能获得流量（流量逻辑）。
- "viralTitle": 基于此灵感拟定一个爆款标题。

示例：
{
  "category": "商业思维",
  "trafficLogic": "利用信息差，满足用户对副业赚钱的渴望，通过具体案例增加可信度。",
  "viralTitle": "普通人翻身机会！2025年这3个风口搞钱项目，错过再等十年"
}
`
  }
};
