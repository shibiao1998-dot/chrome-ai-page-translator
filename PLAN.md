# Chrome AI 网页翻译插件项目计划

## 摘要
目标为实现一款 Chrome Manifest V3 扩展：用户手动触发后，对当前网页正文执行整页 AI 翻译，于原文下方追加简体中文译文，形成双语对照阅读体验。首版支持本地 `Ollama` 与云端 `OpenAI-compatible API` 两类 provider，并允许在弹窗中快速切换活动模型，在设置页中管理完整 provider 配置。

此计划在最初功能规划基础上，吸收三类开源项目的可借点：
- `immersive-translate`：借其“整页翻译为独立系统”的产品与分层思路，不照搬其大体量平台化架构。
- `kiss-translator`：借其扩展骨架、MV3 分层、轻量入口与多 provider 接入经验。
- `Translate-It`：借其 provider registry、统一 messaging、统一 storage、整页翻译文档化抽象。

## 关键实现
### 1. 产品形态与首版边界
- 仅支持 Chrome 桌面端，手动点击扩展后启动整页翻译。
- 仅做“原文下方追加译文”，不做整页原文替换。
- 仅做段落级对应，不做复杂富文本结构重排。
- 翻译风格默认“忠实自然”，只输出简体中文译文，不附加解释。
- 单段失败不阻断整页，原文保留并显示失败状态与重试入口。

### 2. 扩展分层
采用 `kiss-translator` 式轻骨架，但保持更聚焦的首版目标：
- `manifest.json`：声明 `activeTab`、`storage`、`scripting`、必要 `host_permissions`。
- `background/service worker`：统一接收 popup/options/content 消息，负责 provider 调用与权限边界。
- `content script`：扫描正文节点、构建 segment、插入译文 DOM、维护本页翻译状态。
- `popup`：显示当前 provider/model、开始/停止/重译/清除译文。
- `options page`：维护 provider 列表、默认 provider、base URL、API key、模型名、超时与分段参数。

设计原则：
- 入口文件保持极薄，仅负责启动各自模块。
- 页面扫描、翻译调度、provider 适配、状态持久化分别独立，不在单文件内混写。

### 3. 整页翻译系统
吸收 `immersive-translate` 与 `Translate-It` 的思路，但缩为首版可控实现：
- 定义独立 `PageTranslationManager` 或同等 orchestrator，统筹整页生命周期。
- 定义 `SegmentCollector`：扫描 `p/li/h1-h6/blockquote/td/th/span` 等可见正文节点。
- 过滤隐藏节点、过短文本、纯符号/数字、代码块、导航/按钮/输入控件、插件自身注入节点。
- 对过长段落按句号、换行、标点再切分，建立 `segmentId -> DOM anchor` 映射。
- 串行发送 segment 至 background，由 background 调 provider 翻译。
- 每段完成即在原文下方插入译文容器，形成渐进渲染。
- 支持本页停止、清除、重试失败段。
- 为动态站点预留二次扫描机制，但首版不做复杂 viewport lazy-loading 与 iframe 深支持。

### 4. Provider 抽象
吸收 `Translate-It` 的 registry 思路，首版定义最小稳定接口：
- `ProviderConfig`
  - `id`
  - `type`: `ollama | openai_compatible`
  - `label`
  - `baseUrl`
  - `model`
  - `apiKey`
  - `enabled`
- `TranslationSegment`
  - `id`
  - `text`
  - `sourceUrl`
- `TranslationResult`
  - `segmentId`
  - `translation`
  - `error`
- `PageTranslationState`
  - `status`
  - `total`
  - `completed`
  - `failed`
  - `activeProviderId`
- `TranslatorProvider`
  - `translateSegment(segment, config): Promise<TranslationResult>`
  - `healthCheck(config): Promise<{ ok: boolean; message?: string }>`
- `BackgroundMessage` / `ContentMessage`
  - `START_TRANSLATION`
  - `STOP_TRANSLATION`
  - `RETRY_SEGMENT`
  - `CLEAR_TRANSLATIONS`
  - `GET_STATUS`

provider 策略：
- `Ollama`：优先支持原生 `api/chat` 风格；必要时兼容其 OpenAI-compatible 方式。
- `OpenAI-compatible`：默认走 `chat/completions`，首版不扩 `responses`。
- provider 选择逻辑统一在 background 的 resolver 层处理，不分散在 popup 与 content 中。

### 5. Messaging 与 Storage
借 `Translate-It` 的统一层思想，但维持首版简洁：
- 建立统一 message action 常量，所有上下文只通过明确定义的 action 通讯。
- 建立统一 storage 封装，不直接在各模块散用 `chrome.storage.local/sync`。
- 建议分层：
  - `storage.local`：API key、provider 列表、敏感配置
  - `storage.sync`：默认 provider、UI 偏好、一般设置
- popup 与 options 均通过 storage 层读写设置，不自行拼接底层 key。

### 6. 开源项目借鉴结论
- 借 `immersive-translate`：
  - 整页翻译必须是独立子系统，不应混入普通划词翻译逻辑。
  - 页面层、调度层、provider 层、渲染层应解耦。
- 借 `kiss-translator`：
  - MV3 项目结构保持轻量清晰，background/content/popup/options 分责明确。
  - 入口薄、管理器厚，便于后续扩展。
  - 对 Ollama 的现实问题要显式记录：本地服务可能需配置 `OLLAMA_ORIGINS=*` 以解决 CORS。
- 借 `Translate-It`：
  - provider registry 与统一 message/storage 是后续扩展新 provider 的关键。
  - 整页翻译系统需有明确状态模型与失败恢复策略。
- 不采纳者：
  - 不引入 Vue/Pinia/Sidepanel/TTS/词典/浮动按钮/跨浏览器打包等重型能力。
  - 不做其复杂的 rate-limit manager、circuit breaker、streaming coordinator、shadow UI host 全家桶。

## 测试与验收
### 功能场景
- 点击 popup 中“开始翻译”后，普通文章页可逐段显示简体中文译文，位置在原文下方。
- 在 popup 切换 `Ollama` 与 `OpenAI-compatible` provider 后，同一页面逻辑无须变化即可继续翻译。
- options 中修改 provider 配置后，popup 能读取并反映当前默认设置。
- 单段翻译失败时，仅该段显示失败状态，其余段继续翻译。
- 点击“清除译文”后，插件注入内容全部移除，原页面结构保持可用。

### 技术场景
- Chrome 开发者模式可正常加载扩展。
- `localhost:11434` 可被扩展访问；若失败，界面能明确提示与 CORS/服务未启动相关原因。
- 自定义 `baseUrl` 与 `Authorization` 头对 OpenAI-compatible 服务生效。
- 消息在 popup/background/content 之间能正确流转，不因 service worker 生命周期导致整体失效。

### 边界场景
- 长网页不会因单次请求过长而整体失败。
- 重复点击“开始翻译”不会产生重复译文节点。
- 页面刷新后，若未启用缓存，则需重新翻译。
- 动态网页在初始加载后可通过再次扫描补充新段落，但首版不保证无限滚动站点完整覆盖。

## 假设与默认
- 仓库首版以纯前端扩展直连模型服务，不引入代理后端。
- GitHub Project 已创建，可作为后续任务拆解看板，但本计划文件本身应存于项目根目录，作为实现总纲。
- 建议文档文件名为 `PLAN.md`，置于仓库根目录。
- 若后续进入实现阶段，应先提交此计划文档，再开始扩展骨架与 provider 抽象实现。
