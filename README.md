## EdgeWave Nexus（边缘浪潮枢纽）

**作品访问 URL（部署在阿里云 ESA Pages）**：`https://edgewave-nexus.7d7df28e.er.aliyun-esa.net`

**GitHub 公开仓库地址**：`https://github.com/liuyve552/edgewave-nexus`

### 官方声明（必须）

本项目由阿里云ESA提供加速、计算和保护

![阿里云ESA Pages，构建、加速并保护你的网站](public/esa-pages-banner.png)

---

## 项目简介

EdgeWave Nexus 是一个“三重融合”的边缘演示平台，用于在评审面前用**可量化的性能对比**与**电影级可视化**展示：

- **边缘计算极速**：RPC 竞速代理（Promise.race + Promise.any），返回最快成功结果，避免“快失败”陷阱
- **Web3 链上实时**：30 秒节奏聚合 Uniswap V3 / Aave / Compound 的代表性链上信号，结构化输出并缓存
- **AI 代理智能**：前端流式对话 UI + 边缘侧洞察生成（可在 ESA 运行；若模型不可用则自动降级为结构化分析，保证可跑）

评审核心页面：
- `/demo`：Edge Sniper 对比模式（左：基线；右：EdgeWave 加速）+ 实时仪表盘
- `/`：3D DeFi 星系（Hover 注解 + 点击详情 + 动态能量线）+ AI Insight Chat

## 评分维度对齐（官方 4.1）

- **创意卓越**：3D DeFi 星系 + 流式 AI 报告 + 对比模式“秒懂”证明
- **应用价值**：为链上数据看板/RPC 可靠性提供可复用的“边缘加速 + 可观测”方案
- **技术探索**：基于 ESA Pages +（可选）边缘函数/缓存的边缘应用架构；边缘函数包含完整日志与安全降级

## 本地运行

在项目根目录执行：

```bash
npm install
npm run dev
```

打开：
- Home：`http://localhost:3000`
- Compare Demo：`http://localhost:3000/demo`

## ESA Pages 部署（官方要求）

1) 将本项目推送到 **GitHub 公开仓库**
2) 在 **阿里云 ESA Pages** 控制台连接该仓库并按指引完成构建部署
3) 部署成功后，把 **可访问 URL** 填回本 README 顶部，并同步到 `SUBMISSION.txt`

边缘函数（如需在 ESA 控制台创建）请看：
- `DEPLOYMENT.md`

## 关键代码位置

- ESA 边缘函数（可直接粘贴 ESA 控制台）：`esa-functions/`
  - `esa-functions/edgeRpcRouter.js`
  - `esa-functions/edgeDefiAggregator.js`
  - `esa-functions/edgeAIInsight.js`
- Next.js 页面：`app/page.tsx`、`app/demo/page.tsx`
- 3D 星系：`components/defi/DefiDataGalaxy.tsx`
- AI 对话：`components/ChatWithChain.tsx`

## 合规与原创（官方“作品要求”）

- 本作品为参赛者原创，遵守第三方版权、商标及隐私权要求
- 内容健康合规，不包含违法、暴力、仇恨、误导等不当信息

## 文档

- 交付包索引：`DELIVERY.md`
- 部署说明：`DEPLOYMENT.md`
- 演示脚本：`PRESENTATION.md`
