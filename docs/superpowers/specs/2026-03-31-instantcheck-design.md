# 秒测 (InstantCheck) — MVP 设计文档

## 概述

**痛点**：看完长文或复杂知识点后，不知道重点在哪，也不知道自己掌握了没有。

**解决方案**：用户粘贴文本或输入 URL，AI 自动提取关键点摘要，然后生成 4 选 1 测验题，帮用户快速检验掌握程度。

**产品形态**：纯 Web 应用，无需注册，用完即走。

## 核心流程

```
输入页 → 摘要页 → 测验页 → 结果页
```

1. **输入页**：用户粘贴文本或输入 URL，点击"开始分析"
2. **摘要页**：AI 提取关键点，以卡片网格展示，用户确认后进入测验
3. **测验页**：AI 生成 5 道 4 选 1 选择题，所有题目纵向排列，用户滚动作答
4. **结果页**：顶部展示大字得分，下方逐题列出对错，错题展开显示答案解析

## 页面设计

### 输入页

- 居中卡片布局
- 顶部产品名称 + 一句话描述
- Tab 切换两种输入模式："粘贴文本" / "输入 URL"
- 粘贴文本模式：一个大文本域
- URL 模式：一个输入框
- 底部"开始分析"按钮
- 点击后进入 loading 状态：按钮禁用，显示"正在分析..."动画（LLM 调用可能需要 10-30 秒）
- 文本输入限制：最多 10000 字符（避免 token 消耗过大）

### 摘要页

- 标题："关键点摘要"，副标题显示提取了几个关键点
- 卡片网格布局展示关键点（3-7 个）
- 每张卡片包含：关键点标题 + 详细说明
- 卡片尺寸需足够展示完整信息，避免截断
- 底部按钮："我已了解，开始测验"

### 测验页

- 顶部显示题目总数和已答题数
- 所有题目在一页中纵向排列
- 每道题包含：题号、题目描述、4 个选项（A/B/C/D）
- 用户点击选项即选中，可更改
- 底部"提交答案"按钮，需全部作答后才可点击

### 结果页

- 顶部大字展示得分（如 4/5）和正确率
- 进度条可视化正确率
- 下方逐题列出结果：
  - 正确题：绿色标记，折叠显示
  - 错误题：红色标记，展开显示用户答案、正确答案、解析
- 底部"再来一篇"按钮，返回输入页

## 技术架构

### 项目结构

```
instantcheck/
├── frontend/          # 前端 SPA
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/           # Go 后端
│   ├── cmd/
│   ├── internal/
│   ├── go.mod
│   └── go.sum
└── README.md
```

### 前端

- 框架：React + TypeScript（生态成熟，组件化开发高效）
- 构建工具：Vite
- 样式：Tailwind CSS
- 状态管理：React 内置 useState/useReducer（无需外部状态库）
- 路由：React Router，4 个页面路由
- HTTP 请求：fetch API

### 后端

- 语言：Go
- HTTP 框架：Gin
- 数据库：MySQL（通过 GORM）
- 数据库用途（MVP 阶段）：完整记录每次使用日志（用户输入、生成耗时、测验作答详情、正确率）
- CORS：Gin 中间件配置允许前端域名跨域访问

### API 设计

#### POST /api/analyze

接收用户输入，返回关键点摘要和测验题。

**请求体**：

```json
{
  "type": "text" | "url",
  "content": "文章内容或URL"
}
```

**响应体**：

```json
{
  "summary": {
    "key_points": [
      {
        "title": "关键点标题",
        "description": "详细说明"
      }
    ]
  },
  "quiz": {
    "questions": [
      {
        "id": 1,
        "question": "题目描述",
        "options": ["A选项", "B选项", "C选项", "D选项"],
        "correct_answer": 0,
        "explanation": "答案解析"
      }
    ]
  }
}
```

#### POST /api/quiz-result

用户完成测验后，提交作答结果。

**请求体**：

```json
{
  "analyze_id": 1,
  "answers": [
    {"question_id": 1, "selected_answer": 2},
    {"question_id": 2, "selected_answer": 0}
  ]
}
```

**响应体**：

```json
{
  "success": true
}
```

### 后端处理流程

1. 接收请求，校验输入（文本长度 / URL 格式）
2. 如果是 URL，使用 Go 的 HTTP 客户端抓取网页内容，提取正文
3. 构造 prompt，调用大模型 API（如 Claude API）
4. 解析 LLM 返回的 JSON 结构
5. 记录请求日志到 MySQL
6. 返回结构化结果给前端

### LLM Prompt 策略

单次调用完成摘要 + 出题，prompt 要求 LLM 返回结构化 JSON：

- 从文章中提取 3-7 个关键知识点，每个包含标题和说明
- 基于关键点生成 5 道 4 选 1 选择题
- 每道题附带正确答案索引和解析
- 要求 JSON 格式输出，便于解析

### 数据库表设计

```sql
-- 分析记录表：记录每次分析请求
CREATE TABLE analyze_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    input_type VARCHAR(10) NOT NULL,              -- 'text' 或 'url'
    input_content TEXT NOT NULL,                   -- 完整用户输入内容
    input_url VARCHAR(2048),                       -- URL（type=url 时）
    key_points_json TEXT,                           -- 生成的关键点 JSON
    questions_json TEXT,                            -- 生成的题目 JSON
    key_points_count INT,                          -- 关键点数量
    questions_count INT,                           -- 题目数量
    token_usage INT,                               -- token 消耗
    duration_ms INT,                               -- LLM 处理耗时
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 测验结果表：记录用户作答情况
CREATE TABLE quiz_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    analyze_id BIGINT NOT NULL,                    -- 关联 analyze_logs.id
    answers_json TEXT NOT NULL,                     -- 用户作答详情 JSON（每题选了什么）
    correct_count INT NOT NULL,                    -- 答对数量
    total_count INT NOT NULL,                      -- 总题数
    accuracy DECIMAL(5,2) NOT NULL,                -- 正确率（如 80.00）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analyze_id) REFERENCES analyze_logs(id)
);
```

## 错误处理

- 文本为空或超长：前端校验，显示提示
- URL 无法访问：后端返回错误信息，前端展示"无法获取该网页内容"
- URL 内容太短（< 100 字）：提示"内容过短，无法生成有效测验"
- LLM 返回格式异常：后端重试一次，仍失败则返回"分析失败，请重试"
- 网络超时：前端设置 60 秒超时，超时后提示重试

## 不在 MVP 范围内

- 用户注册/登录
- 历史记录
- 间隔复习
- PDF/文档上传
- 多语言支持
- 移动端适配（MVP 只考虑桌面端）
