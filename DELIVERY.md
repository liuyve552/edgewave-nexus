# EdgeWave Nexus — Project Delivery Pack

## 0) Quick Links

- Integrated entry (ESA Pages + Functions): `edge/index.js` + `esa.jsonc`
- Edge functions: `esa-functions/`
- Next.js pages: `app/`
- Core components: `components/`
- Edge-like logic (local fallbacks / client-side): `lib/edge/`
- Deployment guide: `DEPLOYMENT.md`
- Judge demo script: `PRESENTATION.md`

## 1) Repository File Tree (excluding `node_modules/`, `.next/`, `.git/`)

```
.
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ app/
│  ├─ demo/page.tsx
│  ├─ favicon.ico
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  ├─ defi/DefiDataGalaxy.tsx
│  ├─ ui/...
│  ├─ ChatWithChain.tsx
│  ├─ error-boundary.tsx
│  └─ site-header.tsx
├─ contracts/
│  └─ defi.ts
├─ esa-functions/
│  ├─ edgeAIInsight.js
│  ├─ edgeDefiAggregator.js
│  └─ edgeRpcRouter.js
├─ lib/
│  ├─ edge/
│  │  ├─ aiInsight.ts
│  │  ├─ defiAggregator.ts
│  │  └─ rpcRouter.ts
│  ├─ config.ts
│  ├─ http.ts
│  └─ utils.ts
├─ public/...
├─ DEPLOYMENT.md
├─ PRESENTATION.md
├─ eslint.config.mjs
├─ next.config.ts
├─ package.json
├─ package-lock.json
└─ tsconfig.json
```

## 2) Modules → Code Mapping (per `read_01.txt`)

### Module A — Project Init & Base Architecture

- Next.js 15 + TypeScript + Tailwind + shadcn/ui
- Directory structure:
  - `app/`, `lib/`, `components/`, `esa-functions/`, `contracts/`

### Module B — ESA Edge Layer “RPC Sniper”

- Function: `edgeRpcRouter`
- File: `esa-functions/edgeRpcRouter.js`
- Local fallback (client-side): `lib/edge/rpcRouter.ts` + `public/edgewave-dapp.html`

### Module C — Edge Data Orchestration “Chain Data Storm”

- Function: `edgeDefiAggregator`
- File: `esa-functions/edgeDefiAggregator.js`
- Local fallback (client-side): `lib/edge/defiAggregator.ts`

### Module D — Visualization “3D DeFi Galaxy”

- Component: `DefiDataGalaxy`
- File: `components/defi/DefiDataGalaxy.tsx`

### Module E — AI Agent “Chain Insight”

- Frontend component: `ChatWithChain`
- File: `components/ChatWithChain.tsx`
- ESA function: `edgeAIInsight`
- File: `esa-functions/edgeAIInsight.js`
- Note: frontend is static-exported; configure `NEXT_PUBLIC_EDGE_AI_INSIGHT_URL` to enable the agent.

### Module F — Frontend Integration “Edge Sniper” Compare Page

- Route: `app/demo/page.tsx`
