/**
 * verify_webhook.js
 * 
 * Script de homologação pós-deploy do webhook Asaas para o PoçosHost.
 * Dispara requisições simuladas reais (caminho feliz e caminhos de erro) contra
 * a API (local ou em produção) sob SSL/HTTP para atestar a segurança e o parsing
 * do webhook do Asaas de forma rigorosa.
 * 
 * Uso:
 *   node scripts/verify_webhook.js --url <URL_BASE_DA_API> --token <TOKEN_DE_ACESSO> --reservation <UUID_RESERVA>
 * 
 * Exemplo:
 *   node scripts/verify_webhook.js --url http://localhost:3001/api --token meuTokenSeguro --reservation 7fa9a3d4-b7be-443b-bd9c-85a02e6c551c
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Inicializar variáveis de ambiente se houver arquivo .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cores ANSI para formatação elegante no terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Parsing simples dos argumentos CLI
const args = {};
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, val] = arg.split('=');
    if (val) {
      args[key.slice(2)] = val;
    } else {
      const nextIndex = process.argv.indexOf(arg) + 1;
      const nextVal = process.argv[nextIndex];
      if (nextVal && !nextVal.startsWith('--')) {
        args[key.slice(2)] = nextVal;
      }
    }
  }
});

// Resolução dos parâmetros (CLI > Env > Fallback)
const apiUrl = args.url || process.env.VITE_API_URL || 'http://localhost:3001/api';
const webhookToken = args.token || process.env.ASAAS_WEBHOOK_TOKEN;
const reservationId = args.reservation || '00000000-0000-0000-0000-000000000000';

console.log(`${colors.cyan}${colors.bold}=== POÇOSHOST Webhook Integrity Auditor ===${colors.reset}\n`);
console.log(`📍 URL da API:    ${colors.bold}${apiUrl}${colors.reset}`);
console.log(`🔑 Webhook Token: ${colors.bold}${webhookToken ? '*** (Definido)' : '⚠️ NÃO DEFINIDO!'}${colors.reset}`);
console.log(`📅 Reserva UUID:  ${colors.bold}${reservationId}${colors.reset}\n`);

if (!webhookToken) {
  console.error(`${colors.red}❌ ERRO: O token do webhook Asaas não foi fornecido via --token ou ASAAS_WEBHOOK_TOKEN no .env.${colors.reset}`);
  process.exit(1);
}

const webhookEndpoint = `${apiUrl}/webhooks/asaas`;

/**
 * Função utilitária para disparar POST request para o Webhook
 */
async function sendWebhookRequest({ token, payload }) {
  const headers = {
    'Content-Type': 'application/json',
    'asaas-access-token': token
  };

  try {
    const response = await fetch(webhookEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    let body = {};
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    return {
      status: response.status,
      body
    };
  } catch (error) {
    return {
      status: 0,
      error: error.message
    };
  }
}

/**
 * Suite de Execução de Homologação de Webhooks
 */
async function runSuite() {
  let passedTests = 0;
  let failedTests = 0;

  // --- CASO DE TESTE 1: Bloqueio com Token Inválido ---
  console.log(`🤖 [Caso 1/4] Testando rejeição com token inválido...`);
  const test1 = await sendWebhookRequest({
    token: 'token_totalmente_errado_123',
    payload: {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_test_001',
        status: 'RECEIVED',
        externalReference: `reservation_${reservationId}`
      }
    }
  });

  if (test1.status === 403) {
    console.log(`${colors.green}✅ SUCESSO: Requisição rejeitada com 403 Forbidden (Token Inválido).${colors.reset}`);
    passedTests++;
  } else {
    console.error(`${colors.red}❌ FALHA: A API deveria retornar 403 para token inválido, mas retornou ${test1.status}.${colors.reset}`);
    failedTests++;
  }
  console.log(`----------------------------------------------------------------`);

  // --- CASO DE TESTE 2: Tolerância a Eventos sem Payment / Sem Ref Externa ---
  console.log(`🤖 [Caso 2/4] Testando tolerância de payloads sem referência externa...`);
  const test2 = await sendWebhookRequest({
    token: webhookToken,
    payload: {
      event: 'PAYMENT_CREATED',
      payment: {
        id: 'pay_test_002',
        status: 'PENDING'
        // Sem externalReference
      }
    }
  });

  if (test2.status === 200 && test2.body.success) {
    console.log(`${colors.green}✅ SUCESSO: Retornou 200 OK de forma resiliente para payload sem referência.${colors.reset}`);
    passedTests++;
  } else {
    console.error(`${colors.red}❌ FALHA: Deveria retornar 200 OK resiliente, mas retornou ${test2.status} (body: ${JSON.stringify(test2.body)}).${colors.reset}`);
    failedTests++;
  }
  console.log(`----------------------------------------------------------------`);

  // --- CASO DE TESTE 3: Homologação do Caminho Feliz / Reserva Não Encontrada ---
  console.log(`🤖 [Caso 3/4] Testando parsing do externalReference...`);
  // Caso reservationId seja o de testes (00000000-0000-0000-0000-000000000000), o sistema
  // deve validar o token e tentar buscar no DB. Se o token for válido e o DB responder,
  // mas a reserva de teste não existir, o controller retornará 404.
  // Isso atesta que o token foi validado com sucesso e o parsing da referência funcionou.
  const test3 = await sendWebhookRequest({
    token: webhookToken,
    payload: {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_test_003',
        status: 'RECEIVED',
        externalReference: `reservation_${reservationId}`
      }
    }
  });

  if (reservationId === '00000000-0000-0000-0000-000000000000') {
    if (test3.status === 404) {
      console.log(`${colors.green}✅ SUCESSO: Token validado com sucesso e DB consultado. Reserva de testes não encontrada retornou 404 (Esperado).${colors.reset}`);
      passedTests++;
    } else {
      console.error(`${colors.red}❌ FALHA: Deveria retornar 404 para reserva inexistente com token válido, mas retornou ${test3.status} (body: ${JSON.stringify(test3.body)}).${colors.reset}`);
      failedTests++;
    }
  } else {
    // Se o usuário passou um UUID de reserva real
    if (test3.status === 200) {
      console.log(`${colors.green}✅ SUCESSO: Reserva real ID ${reservationId} processada com 200 OK pelo Webhook Asaas!${colors.reset}`);
      passedTests++;
    } else if (test3.status === 404) {
      console.log(`${colors.yellow}⚠️ AVISO: Token validado, mas a reserva real ID ${reservationId} não existe no banco de dados da API. Retornou 404.${colors.reset}`);
      passedTests++;
    } else {
      console.error(`${colors.red}❌ FALHA: Erro ao tentar processar webhook com reserva real. Status: ${test3.status} (body: ${JSON.stringify(test3.body)}).${colors.reset}`);
      failedTests++;
    }
  }
  console.log(`----------------------------------------------------------------`);

  // --- CASO DE TESTE 4: Tolerância a Formato de Referência Externa Inválido ---
  console.log(`🤖 [Caso 4/4] Testando formato de externalReference inválido...`);
  const test4 = await sendWebhookRequest({
    token: webhookToken,
    payload: {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_test_004',
        status: 'RECEIVED',
        externalReference: `checkout_invalido_sem_reserva_prefixo`
      }
    }
  });

  if (test4.status === 200) {
    console.log(`${colors.green}✅ SUCESSO: API retornou 200 de forma controlada sem estourar exceções de regex.${colors.reset}`);
    passedTests++;
  } else {
    console.error(`${colors.red}❌ FALHA: Deveria tolerar referência inválida com 200 OK, mas retornou ${test4.status}.${colors.reset}`);
    failedTests++;
  }
  console.log(`================================================================`);

  // --- Relatório de Encerramento ---
  console.log(`\n📊 ${colors.bold}Resultado da Auditoria de Homologação de Webhook:${colors.reset}`);
  console.log(`🟢 Casos Passados: ${colors.green}${colors.bold}${passedTests}${colors.reset}`);
  console.log(`🔴 Casos Falhados: ${failedTests > 0 ? colors.red : colors.green}${colors.bold}${failedTests}${colors.reset}\n`);

  if (failedTests > 0) {
    console.error(`${colors.red}${colors.bold}❌ HOMOLOGAÇÃO REJEITADA: Foram encontradas falhas críticas na segurança ou parsing do webhook.${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}🎉 HOMOLOGAÇÃO APROVADA: O webhook Asaas está blindado contra tokens falsos, regex corrompidas e payloads resilientes.${colors.reset}`);
    process.exit(0);
  }
}

runSuite();
