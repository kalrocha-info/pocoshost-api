/**
 * Script de Teste do Upload Seguro (Cloudinary + Multer)
 * Execute: node test-upload.js
 * 
 * Testa 3 cenários:
 * 1. Arquivo válido (imagem PNG)
 * 2. Arquivo inválido (texto disfarçado de jpg)
 * 3. Arquivo muito grande (> 5MB)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_URL = 'http://localhost:3001';

// =============================================
// UTILITÁRIOS
// =============================================
async function fetchWithForm(url, token, filePath, fieldName = 'image') {
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append(fieldName, fs.createReadStream(filePath));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    body: form,
    // @ts-ignore
    duplex: 'half',
  });

  return { status: response.status, body: await response.json() };
}

function createTempFile(name, content) {
  const p = path.join(__dirname, name);
  fs.writeFileSync(p, content);
  return p;
}

function cleanup(...files) {
  for (const f of files) if (fs.existsSync(f)) fs.unlinkSync(f);
}

// =============================================
// TESTES
// =============================================
async function runTests() {
  console.log('\n========================================');
  console.log('🔐  TESTE DE SEGURANÇA - UPLOAD SEGURO');
  console.log('========================================\n');

  // Busca token de autenticação
  let token;
  try {
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'host@pocoshost.com', password: '123456' }),
    });
    const loginData = await loginRes.json();
    token = loginData.token;
    if (!token) throw new Error('Token não recebido.');
    console.log('✅  Login feito com sucesso.\n');
  } catch (err) {
    console.error('❌  Falha no login. Verifique se a API está rodando e se o usuário existe.\n', err.message);
    process.exit(1);
  }

  // ─── TESTE 1: Arquivo Válido ──────────────────────────────────────
  console.log('--- TESTE 1: Envio de imagem PNG válida ---');
  // Cria um PNG mínimo (1x1 pixel, RGB azul)
  const validPng = createTempFile('test_valid.png', Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
    '2e00000000c4944415478016360f8cfc000000002000157415c490000000049454e44ae426082', 'hex'
  ));
  try {
    const r = await fetchWithForm(`${API_URL}/api/upload/image`, token, validPng);
    if (r.status === 201 && r.body.url) {
      console.log(`✅  Imagem aceita. URL: ${r.body.url}\n`);
    } else {
      console.log(`⚠️  Resposta inesperada: ${JSON.stringify(r.body)}\n`);
    }
  } catch(err) { console.log(`❌  Erro: ${err.message}\n`); }
  cleanup(validPng);

  // ─── TESTE 2: Arquivo Malicioso Disfarçado ─────────────────────────
  console.log('--- TESTE 2: Script malicioso disfarçado de .jpg ---');
  const fakeImage = createTempFile('malware.jpg', '<?php system($_GET["cmd"]); echo "HACKED"; ?>');
  try {
    const r = await fetchWithForm(`${API_URL}/api/upload/image`, token, fakeImage);
    if (r.status === 400) {
      console.log(`✅  BLOQUEADO corretamente! Resposta: ${r.body.error}\n`);
    } else {
      console.log(`🚨  FALHA DE SEGURANÇA! Arquivo malicioso foi aceito! (status ${r.status})\n`);
    }
  } catch(err) { console.log(`❌  Erro: ${err.message}\n`); }
  cleanup(fakeImage);

  // ─── TESTE 3: Arquivo Muito Grande ────────────────────────────────
  console.log('--- TESTE 3: Arquivo maior que 5MB ---');
  const bigFile = createTempFile('big_file.png', Buffer.alloc(6 * 1024 * 1024, 'X'));
  try {
    const r = await fetchWithForm(`${API_URL}/api/upload/image`, token, bigFile);
    if (r.status === 400) {
      console.log(`✅  BLOQUEADO corretamente! Resposta: ${r.body.error}\n`);
    } else {
      console.log(`⚠️  Arquivo grande passou. (status ${r.status})\n`);
    }
  } catch(err) { console.log(`❌  Erro: ${err.message}\n`); }
  cleanup(bigFile);

  console.log('========================================');
  console.log('✅  TESTES CONCLUÍDOS');
  console.log('========================================\n');
}

runTests().catch(console.error);
