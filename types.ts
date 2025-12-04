

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
  type?: string; // Legacy
  keywords?: string; // New field
  score?: number; // Recommendation score
}

export interface CoverOption {
  visual: string; // Scene description
  copy: string;   // Text on image
  score?: number; // Recommendation score
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
    // Removed corePoint, audience, duration
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
  rating?: string;
  marked?: boolean; // New field for selection/marking state
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
    template: `请基于以下视频脚本，生成10个具有病毒传播潜力、高点击率的YouTube/B站风格标题。

主题: {{title}}
脚本内容概要：
{{script}}

要求：
1. 标题必须紧扣脚本的核心内容。
2. 要有冲击力，引发好奇心或情感共鸣。

请返回一个纯 JSON 数组（不要Markdown格式），数组中每个对象包含三个字段：
- "title": 具体的标题文本
- "keywords": 标题对应的关键标签（例如：悬念、利益、反差、情绪、干货等），确保准确提炼。
- "score": 推荐指数（1-100分），代表该标题的潜在点击率预估。

示例：
[
  {"title": "普通人如何利用AI在30天内赚到第一桶金？", "keywords": "悬念,赚钱,AI", "score": 95},
  {"title": "揭秘OpenAI内部：你不知道的5个真相", "keywords": "揭秘,科技,真相", "score": 88}
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
    
主题: {{title}}
脚本内容:
{{script}}

请返回一个纯 JSON 数组（不要Markdown格式），数组中每个对象包含三个字段：
- "visual": 详细的画面描述（包含主体、表情、背景颜色、氛围）。
- "copy": 封面上的文案（Copywriting）。**必须严格包含4行文字**（使用换行符分隔）。每行文字要简短有力，结构建议：第一行提出痛点/疑问，第二行否定常识/制造冲突，第三行给出颠覆性观点，第四行号召/强调（如【必看】）。
- "score": 推荐指数（1-100分）。

示例：
[
  {
    "visual": "极度震惊的表情特写，背景是燃烧的红色火焰", 
    "copy": "學習要從基礎打起？\\n大錯特錯的舊觀念\\n高手都從頂層學起\\n【想考高分必看！】", 
    "score": 95
  },
  {
    "visual": "左右分屏对比...", 
    "copy": "月薪三千怎么存钱？\\n別再只會省吃儉用\\n學會這招資產翻倍\\n【親測有效】", 
    "score": 88
  }
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
  },
  AI_TITLES_GENERATOR: {
    id: 'ai_titles_gen',
    name: 'AI 标题生成',
    description: '独立工具：基于输入的标题方向或内容生成爆款标题与封面方案',
    template: `请基于以下给出的标题方向，生成一组爆款视频标题，以及一个高点击率的封面策划方案。

标题方向:
{{TITLE_DIRECTION}}

要求：
1. 标题风格多样，适配 YouTube/B站/抖音 调性。
2. 封面策划要吸睛，元素丰富。
3. 封面文案要简短有力。

请返回一个纯 JSON 对象（不要Markdown格式），**必须严格包含**以下三个字段：
- "titles": 字符串数组，包含 10 个具有病毒传播潜力的标题。
- "coverVisual": 字符串，详细描述封面画面的视觉元素、构图、颜色和氛围。
- "coverText": 字符串，封面上的大字文案（简短有力，建议2-4行）。

示例 JSON 结构:
{
  "titles": ["标题1", "标题2", ...],
  "coverVisual": "一个震惊的表情特写...",
  "coverText": "文字行1\\n文字行2"
}
`
  }
};
