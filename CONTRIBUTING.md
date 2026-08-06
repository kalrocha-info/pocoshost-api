# CONTRIBUTING.md — Protocolo de Contribuição PoçosHost API

> **⛔ LEITURA OBRIGATÓRIA**  
> Este documento deve ser lido **integralmente** por qualquer desenvolvedor humano,
> colaborador externo ou **modelo de IA** antes de qualquer interação com o código.
> Nenhuma contribuição — commit, PR, sugestão de código ou geração de arquivo — é
> válida sem conformidade com as regras abaixo.

---

## 🔴 REGRA P0 — LEIA O AGENTS.md PRIMEIRO (INEGOCIÁVEL)

O arquivo [`reorientacao_codigo/pocoshost_api_v2/AGENTS.md`](../reorientacao_codigo/pocoshost_api_v2/AGENTS.md)
é a **fonte única da verdade** deste projeto.

**Antes de qualquer linha de código:**

1. Abra e leia `AGENTS.md` na íntegra.
2. Confirme internamente: _"Entendi a arquitetura, as regras de segurança e o padrão de testes?"_
3. Só então escreva código.

Não há exceções. Nem para "correções rápidas". Nem para "só um teste". **Nenhuma.**

---

## 🤖 Para Modelos de IA e Agentes Automatizados

Se você é um modelo de linguagem (Claude, Gemini, GPT ou similar) atuando neste projeto:

```
PROTOCOLO OBRIGATÓRIO (executar na ordem exata):

1. LEIA  → reorientacao_codigo/pocoshost_api_v2/AGENTS.md (completo)
2. ANUNCIE → "🤖 Applying knowledge of @backend-specialist..."
3. VALIDE → "Entendi as 3 diretivas de segurança e o padrão de testes?"
4. CODIFIQUE → Somente após confirmar os 3 passos acima.
```

### Checklist de autocontrole (responda antes de escrever código)

| # | Pergunta | Resposta Esperada |
|---|---|---|
| 1 | Li o AGENTS.md desta sessão? | ✅ Sim |
| 2 | Todas as queries SQL são parametrizadas ($1, $2)? | ✅ Sim |
| 3 | A rota usa `validate(schema)` com Zod? | ✅ Sim |
| 4 | Rotas `/api/host/*` isolam o tenant (`created_by = req.user.id`)? | ✅ Sim |
| 5 | Existe teste de integração para a funcionalidade? | ✅ Sim |
| 6 | `npx vitest run` passa a 100%? | ✅ Sim |
| 7 | `npx eslint "src/**/*.js"` retorna 0 erros? | ✅ Sim |

**Se qualquer resposta for ❌, PARE e corrija antes de continuar.**

---

## 🏗️ Arquitetura e Convenções

### Separação de responsabilidades (OBRIGATÓRIA)

| Camada | Responsabilidade | Proibições |
|---|---|---|
| `routes/` | Declarar rota, aplicar `authRequired`, `adminRequired`, `validate(schema)` | Lógica de negócio, queries SQL |
| `controllers/` | Extrair parâmetros validados, chamar DB, montar resposta | Lógica de regras diretamente no SQL raw sem extração |
| `middleware/validate.js` | Centralizar **todos** os schemas Zod | Schemas inline nas rotas ou controllers |
| `db/migrations/` | SQLs aditivos, idempotentes, numerados sequencialmente | `DROP TABLE`, `ALTER COLUMN` sem migration progressiva |

### Nomenclatura (snake_case — sem exceções)

- Colunas PostgreSQL: `snake_case`
- Payloads JSON (entrada e saída): `snake_case`
- Arquivos de migration: `NNN_descricao_da_migration.sql` (3 dígitos)
- Arquivos JS: `camelCase` (ex.: `contractsController.js`)

---

## 🔒 Segurança — OWASP 2026 (Zero Tolerance)

### SQL Injection — Absolutamente proibido

```js
// ❌ NUNCA FAÇA ISSO
pool.query(`SELECT * FROM users WHERE email = '${email}'`)

// ✅ SEMPRE ASSIM
pool.query('SELECT * FROM users WHERE email = $1', [email])
```

### Autenticação e Autorização

```js
// Rotas admin: dupla proteção obrigatória
router.get('/admin/...', authRequired, adminRequired, handler)

// Rotas host: isolamento de tenancy obrigatório
// WHERE property_id = $1 AND created_by = $2  ← SEMPRE validar o created_by
```

### Nunca expor em logs ou respostas

- `password_hash`
- Tokens JWT
- Chaves de API
- CPF/CNPJ completo
- Dados de cartão de crédito

---

## 🧪 Padrão de Testes (Zero-Flakiness Protocol)

### Regras inegociáveis

1. **100% de aprovação** — `npx vitest run` deve passar completamente antes de qualquer commit.
2. **Isolamento total** — cada teste usa `afterEach` com `TRUNCATE` para limpar o banco.
3. **Factories robustas** — use `createUser()`, `createProperty()` de `src/tests/helpers/factories.js`. Nunca crie dados fixos que causem colisão de unicidade.
4. **Tipos de teste obrigatórios** por funcionalidade nova:
   - ✅ 401 (sem token)
   - ✅ 403 (token de role errada)
   - ✅ 200/201 (caminho feliz)
   - ✅ 400 (validação Zod)
   - ✅ 404 (recurso inexistente)
   - ✅ 409 (conflito de unicidade, se aplicável)
   - ✅ Isolamento de tenancy (se rota `/api/host/*`)

### Estrutura de teste padrão

```js
import './helpers/setup.js'  // ← OBRIGATÓRIO em todo arquivo de teste

describe('DOMÍNIO — /api/admin/...', () => {
  it('bloqueia acesso sem token', ...)
  it('bloqueia role incorreta', ...)
  it('retorna 200 no caminho feliz', ...)
  it('rejeita payload inválido (Zod)', ...)
})
```

---

## 📋 Checklist Pré-Commit (OBRIGATÓRIO)

Execute na ordem. **Não faça commit se algum item falhar.**

```bash
# 1. Testes
npx vitest run
# Resultado esperado: X tests | X passed (100%)

# 2. Lint
npx eslint "src/**/*.js"
# Resultado esperado: (sem saída) = 0 erros

# 3. Verificar arquivos novos/modificados
git diff --name-only HEAD
```

---

## 📝 Registro de Microetapas (OBRIGATÓRIO)

Toda microetapa concluída **deve** gerar um arquivo de registro em:
`reorientacao_pocoshost/REGISTRO_MICROETAPA_<TEMA>_<DATA>.md`

Estrutura mínima do registro:

```markdown
# Registro — <Nome da Microetapa> — <DD/MM/AAAA>

## Arquivos criados/modificados
- `src/controllers/xController.js` [NOVO]
- `src/routes/admin.js` [MODIFICADO]
- `src/db/migrations/NNN_tema.sql` [NOVO]
- `src/tests/x.test.js` [NOVO]

## Endpoints adicionados
| Método | Rota | Descrição |
|---|---|---|
| POST | /api/admin/... | ... |

## Resultado dos testes
- npx vitest run: X/X passed (100%)
- npx eslint "src/**/*.js": 0 erros

## Notas
...
```

---

## 🚀 Deploy

- **Branch**: `master`
- **Deploy automático**: GitHub Actions → SSH Hostinger
- **Quality Gates no servidor**: se testes ou ESLint falharem durante deploy, o processo para automaticamente
- **Staging**: **ABANDONADO** (ver [`DECISAO_03_ABANDONO_ETAPA_STAGING.md`](../reorientacao_pocoshost/DECISAO_03_ABANDONO_ETAPA_STAGING.md))
- **Reinício do Passenger**: `touch tmp/restart.txt` no App Root da Hostinger

---

## 📚 Documentos de Referência

| Documento | Caminho | Importância |
|---|---|---|
| **AGENTS.md** | `reorientacao_codigo/pocoshost_api_v2/AGENTS.md` | 🔴 P0 — Leitura obrigatória |
| **CONTRIBUTING.md** | `pocoshost_api/CONTRIBUTING.md` | 🔴 P0 — Este documento |
| **Mapa de Próximos Passos** | `reorientacao_pocoshost/MAPA_PROXIMOS_PASSOS_POCOSHOST_V2.md` | 🟡 P1 — Roadmap |
| **Decisão 01** | `reorientacao_pocoshost/DECISAO_01_FLUXO_PAGAMENTOS_AIRBNB.md` | 🟡 P1 — Modelo financeiro |
| **Decisão 03** | `reorientacao_pocoshost/DECISAO_03_ABANDONO_ETAPA_STAGING.md` | 🟡 P1 — Deploy direto |
| **Pipeline Deploy** | `reorientacao_pocoshost/DOCUMENTACAO_PIPELINE_DEPLOY.md` | 🟢 P2 — Infra Hostinger |

---

*Última atualização: 2026-08-06*  
*Mantido por: @backend-specialist — PoçosHost v2*
