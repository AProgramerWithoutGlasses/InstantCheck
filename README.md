# InstantCheck · 秒测

> **深度学习的"知识脱水机"**
> "别让读过的书，只留在浏览器的缓存里。"

秒测 (InstantCheck) 是一款基于 AI 驱动的碎片化知识内化工具。它专门解决现代人"看长文头疼、看后即忘"的痛点。只需粘贴一段复杂的技术文档、深度长文或学习笔记，秒测即可在几秒钟内完成"知识脱水"，通过 LLM 深度理解语义，精准提炼核心考点，并即时生成一套三分钟自测小卷。

**核心亮点：**
- **语义提纯：** 告别无意义的字数堆砌，直击内容灵魂
- **即刻反馈：** 从长文到互动测验仅需一个 LLM 请求，JSON 结构化输出
- **闭环学习：** 强制大脑从"被动输入"转为"主动提取"，让每一分钟的阅读都有迹可循

**在线体验：** [http://quiz.xunxun.me](http://quiz.xunxun.me)

---

## 产品设计

### 核心流程

```
输入页 → 摘要页 → 测验页 → 结果页
```

| 页面 | 说明 |
|------|------|
| **输入页** | 支持两种模式：粘贴文本（上限 30000 字符）/ 输入 URL（自动抓取正文）；点击后进入 loading |
| **摘要页** | AI 提取 3–7 个关键知识点，卡片网格展示；确认后进入测验 |
| **测验页** | 5 道四选一选择题纵向排列，全部作答后方可提交 |
| **结果页** | 顶部大字显示得分和正确率进度条；错题展开显示你的答案、正确答案与解析 |

### 设计原则

- **无账号**：纯 Web、用完即走，无注册、无历史记录
- **单次请求**：摘要与出题合并为一次 LLM 调用，降低延迟
- **容错**：LLM 调用失败自动重试一次；URL 内容过短（< 100 字）提前拦截

---

## 技术方案

### 架构概览

```
浏览器
  │  HTTP / 80
  ▼
Nginx（反代）
  │  proxy_pass :8080
  ▼
Go Server（Gin）
  ├── POST /api/analyze     ← 核心接口
  ├── POST /api/quiz-result ← 作答记录
  └── GET  /*, /assets/*    ← 托管前端静态文件
  │
  ├── Scraper（URL 模式）
  │     └── HTTP GET → HTML → 正则去标签提取正文
  ├── LLM Client
  │     └── DeepSeek API（OpenAI 兼容格式）单次调用
  └── GORM → MySQL
        ├── analyze_logs   ← 每次分析记录
        └── quiz_results   ← 每次作答记录
```

### 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + React Router v7 |
| 后端 | Go + Gin + GORM |
| 数据库 | MySQL 8（GORM AutoMigrate） |
| AI | DeepSeek API（`deepseek-chat`，OpenAI 兼容） |
| 部署 | Linux + systemd + Nginx |

### 目录结构

```
instant-check/
├── frontend/               # React SPA
│   └── src/
│       ├── pages/          # InputPage / SummaryPage / QuizPage / ResultPage
│       ├── api.ts          # fetch 封装
│       └── types.ts        # 共享 TS 类型
└── backend/
    ├── config.yaml         # 配置文件（gitignored）
    ├── config.example.yaml # 配置模板
    └── internal/
        ├── config/         # YAML 配置加载
        ├── handler/        # analyze / quiz_result 处理器
        ├── llm/            # DeepSeek 客户端
        ├── scraper/        # URL 正文提取
        ├── database/       # GORM 连接
        └── model/          # AnalyzeLog / QuizResult
```

### API

**POST /api/analyze**

```json
// 请求
{ "type": "text" | "url", "content": "..." }

// 响应
{
  "id": 1,
  "summary": { "key_points": [{ "title": "...", "description": "..." }] },
  "quiz":    { "questions":  [{ "id": 1, "question": "...", "options": ["A","B","C","D"], "correct_answer": 0, "explanation": "..." }] }
}
```

**POST /api/quiz-result**

```json
// 请求
{ "analyze_id": 1, "answers": [{ "question_id": 1, "selected_answer": 2, "correct_answer": 0 }] }
// 响应
{ "success": true }
```
