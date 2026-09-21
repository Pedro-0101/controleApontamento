'use strict';

/**
 * Integração com WhatsApp via whatsapp-web.js (não oficial, sem custo).
 *
 * A sessão é persistida em disco (.wwebjs_auth), então basta escanear o QR Code
 * uma vez. Se a biblioteca não estiver instalada, o módulo degrada de forma
 * silenciosa e o restante do sistema continua funcionando normalmente.
 */

const path = require('path');
const fs = require('fs');

/**
 * Procura um navegador Chromium já instalado na máquina para evitar o
 * download automático do Chromium pelo puppeteer.
 */
function detectBrowserPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env['ProgramFiles'] || '', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['ProgramFiles'] || '', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

let Client = null;
let LocalAuth = null;
let QRCode = null;
let loadError = null;

try {
  ({ Client, LocalAuth } = require('whatsapp-web.js'));
} catch (e) {
  loadError = `whatsapp-web.js não instalado (${e.message}). Rode "npm install" na pasta backend.`;
}

try {
  QRCode = require('qrcode');
} catch {
  QRCode = null;
}

let client = null;
let ready = false;
let starting = false;
let lastQr = null;
let lastQrAt = null;
let lastError = null;
let me = null;

function isAvailable() {
  return !!Client;
}

function normalizeNumber(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // Número local brasileiro (DDD + número) sem código do país
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  return `${digits}@c.us`;
}

async function init() {
  if (!Client) {
    return { success: false, error: loadError || 'Integração indisponível' };
  }
  if (ready) return { success: true, status: 'ready' };
  if (starting) return { success: true, status: 'starting' };

  // Já existe uma instância (ex.: desconectada) — tenta reconectar sem recriar.
  if (client) {
    starting = true;
    lastError = null;
    client.initialize().catch((e) => {
      starting = false;
      lastError = e.message;
    });
    return { success: true, status: 'starting' };
  }

  starting = true;
  lastError = null;

  try {
    const executablePath = detectBrowserPath();
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
      puppeteer: {
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        // Redes com inspeção de SSL (proxy/antivírus) usam um certificado raiz
        // próprio que o Chrome não confia, causando ERR_CERT_AUTHORITY_INVALID.
        // Ignoramos a validação de certificado apenas neste navegador interno.
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--ignore-certificate-errors',
          '--allow-running-insecure-content',
        ],
      },
    });

    client.on('qr', (qr) => {
      lastQr = qr;
      lastQrAt = new Date().toISOString();
    });

    client.on('ready', () => {
      ready = true;
      starting = false;
      lastQr = null;
      try {
        me = client.info?.wid?._serialized || client.info?.pushname || null;
      } catch {
        me = null;
      }
      console.log('[WhatsApp] Cliente conectado e pronto para envio.');
    });

    client.on('auth_failure', (msg) => {
      starting = false;
      ready = false;
      lastError = `Falha de autenticação: ${msg}`;
      console.error('[WhatsApp]', lastError);
    });

    client.on('disconnected', (reason) => {
      ready = false;
      starting = false;
      me = null;
      lastError = `Desconectado: ${reason}`;
      console.warn('[WhatsApp]', lastError);
    });

    client.initialize().catch((e) => {
      starting = false;
      lastError = e.message;
      console.error('[WhatsApp] Erro ao inicializar:', e.message);
    });

    return { success: true, status: 'starting' };
  } catch (e) {
    starting = false;
    lastError = e.message;
    return { success: false, error: e.message };
  }
}

async function getStatus() {
  let qrDataUrl = null;
  if (lastQr && QRCode) {
    try {
      qrDataUrl = await QRCode.toDataURL(lastQr, { margin: 1, width: 280 });
    } catch {
      qrDataUrl = null;
    }
  }
  return {
    available: isAvailable(),
    ready,
    starting,
    hasQr: !!lastQr,
    qr: lastQr,
    qrDataUrl,
    qrAt: lastQrAt,
    me,
    error: lastError || loadError,
  };
}

async function ensureReady() {
  if (ready) return true;
  if (!Client) return false;
  if (!client || !starting) {
    await init();
  }
  return ready;
}

async function sendMessage(number, text) {
  if (!ready) {
    return { success: false, error: 'WhatsApp não está conectado' };
  }
  const chatId = normalizeNumber(number);
  if (!chatId) {
    return { success: false, error: `Número inválido: ${number}` };
  }
  try {
    await client.sendMessage(chatId, text);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function sendToMany(numbers, text) {
  const results = [];
  for (const number of numbers) {
    results.push({ number, ...(await sendMessage(number, text)) });
  }
  return results;
}

async function logout() {
  try {
    if (client) await client.logout();
  } catch {
    /* ignora */
  }
  ready = false;
  starting = false;
  me = null;
  lastQr = null;
  client = null;
  return { success: true };
}

module.exports = {
  isAvailable,
  init,
  getStatus,
  ensureReady,
  sendMessage,
  sendToMany,
  logout,
  normalizeNumber,
};
