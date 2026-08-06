# PoçosHost API — Backend

> **⛔ STOP — LEIA ANTES DE QUALQUER AÇÃO**  
> Qualquer desenvolvedor, colaborador ou modelo de IA que interaja com este repositório
> **DEVE** ler o arquivo [`CONTRIBUTING.md`](./CONTRIBUTING.md) antes de escrever qualquer linha de código.
> O não cumprimento invalida qualquer contribuição.

---

## Visão Geral

Backend REST da plataforma **PoçosHost** — sistema de cogestão e administração imobiliária voltado para o modelo coanfitrião (Airbnb-Led).

| Campo | Valor |
|---|---|
| **Runtime** | Node.js 24.x (LTS) |
| **Framework** | Express 4.x |
| **Banco de Dados** | PostgreSQL (Neon Serverless) |
| **Validação** | Zod 4.x |
| **Testes** | Vitest 4.x |
| **Lint** | ESLint (Standard) |
| **Deploy** | Hostinger (Phusion Passenger / LiteSpeed) |
| **CI/CD** | GitHub Actions → SSH deploy |
| **Branch Ativa** | `master` |

---

## Pré-requisitos

```bash
node -v   # >= 24.0.0
npm -v    # >= 10.0.0
```

## Instalação

```bash
npm install
cp .env.production.example .env   # preencha as variáveis
```

## Executar localmente

```bash
node src/server.js
```

## Testes (obrigatório 100%)

```bash
npx vitest run
```

## Lint (obrigatório 0 erros)

```bash
npx eslint "src/**/*.js"
```

---

## Estrutura do Projeto

```
src/
├── controllers/     # Orquestração de requisição/resposta
├── db/
│   ├── migrations/  # SQLs numerados (001–NNN) idempotentes
│   ├── migrate.js   # Runner de migrations
│   └── pool.js      # Pool PostgreSQL
├── middleware/
│   ├── auth.js      # authRequired + adminRequired
│   ├── validate.js  # Schemas Zod centralizados
│   └── ...
├── routes/          # Declaração de rotas HTTP
├── services/        # Lógica de negócio desacoplada
├── tests/
│   ├── helpers/     # factories.js, setup.js, mocks
│   └── *.test.js    # Testes de integração por domínio
└── utils/
    └── http.js      # sendServerError, sendValidationError
```

---

## Documentação de Governança

| Documento | Descrição |
|---|---|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | **⬅ LEIA PRIMEIRO** — Regras obrigatórias de contribuição |
| [`reorientacao_codigo/pocoshost_api_v2/AGENTS.md`](../reorientacao_codigo/pocoshost_api_v2/AGENTS.md) | Fonte única da verdade — arquitetura, rotas, segurança, padrões |
| [`reorientacao_pocoshost/MAPA_PROXIMOS_PASSOS_POCOSHOST_V2.md`](../reorientacao_pocoshost/MAPA_PROXIMOS_PASSOS_POCOSHOST_V2.md) | Roadmap de próximos passos |
| [`reorientacao_pocoshost/DECISAO_03_ABANDONO_ETAPA_STAGING.md`](../reorientacao_pocoshost/DECISAO_03_ABANDONO_ETAPA_STAGING.md) | Deploy direto com Quality Gates (staging abandonado) |

---

## Endpoints Principais

Consulte a tabela completa em [`AGENTS.md §6`](../reorientacao_codigo/pocoshost_api_v2/AGENTS.md#6-mapa-completo-de-rotas-e-endpoints).

| Grupo | Prefixo | Proteção |
|---|---|---|
| Saúde | `/api/health/*` | Público |
| Autenticação | `/api/auth/*` | Público |
| Admin | `/api/admin/*` | `authRequired` + `adminRequired` |
| Anfitrião | `/api/host/*` | `authRequired` (tenancy isolado) |
| Webhooks | `/api/webhooks/*` | Secret header |
