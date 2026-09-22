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
const { execFileSync } = require('child_process');

const SESSION_DIR = path.join(__dirname, '.wwebjs_auth', 'session');

/**
 * Procura navegadores Chromium já instalados na máquina (Chrome e Edge) para
 * evitar o download automático do Chromium pelo puppeteer.
 */
function detectBrowserPaths() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return [process.env.PUPPETEER_EXECUTABLE_PATH];
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
  return candidates.filter((p) => p && fs.existsSync(p));
}

function detectBrowserPath() {
  return detectBrowserPaths()[0] || null;
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

let puppeteerLib = null;
try {
  puppeteerLib = require('puppeteer');
} catch {
  puppeteerLib = null;
}

// Flags recomendadas para rodar headless em Windows/VM e atrás de proxy com
// inspeção de SSL (evita ERR_CERT_AUTHORITY_INVALID).
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--metrics-recording-only',
  '--mute-audio',
  '--hide-scrollbars',
  '--ignore-certificate-errors',
  '--allow-running-insecure-content',
];

let workingConfig = null;

/**
 * Lista configurações de navegador a tentar, em ordem de preferência:
 * cada navegador instalado (headless novo e antigo) e, por fim, o Chromium
 * baixado pelo próprio puppeteer.
 */
function launchCandidates() {
  const list = [];
  for (const exec of detectBrowserPaths()) {
    list.push({ executablePath: exec, headless: true, args: BROWSER_ARGS });
    list.push({ executablePath: exec, headless: 'shell', args: BROWSER_ARGS });
  }
  list.push({ headless: true, args: BROWSER_ARGS });
  list.push({ headless: 'shell', args: BROWSER_ARGS });
  return list;
}

/**
 * Testa as configurações até encontrar uma que consiga abrir o navegador.
 * O resultado fica em cache para as próximas inicializações.
 */
async function findWorkingConfig() {
  if (workingConfig) return workingConfig;
  const candidates = launchCandidates();
  if (!puppeteerLib) return candidates[0] || null;

  for (const cfg of candidates) {
    const label = `headless=${cfg.headless} browser=${cfg.executablePath || 'bundled'}`;
    try {
      const browser = await puppeteerLib.launch(cfg);
      await browser.close();
      workingConfig = cfg;
      console.log(`[WhatsApp] Config de navegador OK: ${label}`);
      return cfg;
    } catch (e) {
      console.warn(`[WhatsApp] Config falhou (${label}): ${errText(e)}`);
    }
  }
  return candidates[0] || null;
}

let client = null;
let ready = false;
let starting = false;
let lastQr = null;
let lastQrAt = null;
let lastError = null;
let me = null;
let lastBrowserPath = null;
let lastFailureAt = 0;

function errText(e) {
  if (e === undefined) return 'erro desconhecido (undefined)';
  if (e === null) return 'erro desconhecido (null)';
  if (typeof e === 'string') return e;
  if (e.message) return e.message;
  try {
    const s = JSON.stringify(e);
    if (s && s !== '{}') return s;
  } catch {
    /* ignora */
  }
  return String(e);
}

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

/**
 * Encerra navegadores órfãos que ainda estejam usando a pasta de sessão do
 * WhatsApp e remove arquivos de lock deixados por execuções anteriores.
 * Sem isso, o puppeteer no Windows acusa "The browser is already running".
 */
function prepareSessionDir() {
  if (process.platform === 'win32') {
    try {
      const script =
        `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | ` +
        `Where-Object { $_.CommandLine -like '*${SESSION_DIR}*' } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      execFileSync('powershell', ['-NoProfile', '-Command', script], {
        stdio: 'ignore',
        timeout: 15000,
      });
    } catch {
      /* ignora */
    }
  }

  const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const name of lockFiles) {
    try {
      fs.rmSync(path.join(SESSION_DIR, name), { force: true });
    } catch {
      /* ignora */
    }
  }
}

async function destroyClient() {
  const c = client;
  client = null;
  if (!c) return;
  try {
    await c.destroy();
  } catch {
    /* ignora */
  }
}

async function init() {
  if (!Client) {
    return { success: false, error: loadError || 'Integração indisponível' };
  }
  if (ready) return { success: true, status: 'ready' };
  if (starting) return { success: true, status: 'starting' };

  // Instância anterior que não chegou a ficar pronta: descarta e recria do zero,
  // evitando erros ao reinicializar um cliente já quebrado.
  if (client) {
    await destroyClient();
  }

  starting = true;
  lastError = null;

  try {
    // Remove locks/navegadores órfãos que impediriam a abertura da sessão.
    prepareSessionDir();

    const config = await findWorkingConfig();
    lastBrowserPath = (config && config.executablePath) || null;
    console.log(
      `[WhatsApp] Iniciando navegador${lastBrowserPath ? ` (${lastBrowserPath})` : ' (Chromium do puppeteer)'}...`
    );

    client = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
      authTimeoutMs: 120000,
      puppeteer: {
        ...(config || { headless: true, args: BROWSER_ARGS }),
        dumpio: process.env.WHATSAPP_DEBUG === '1',
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
      lastError = `Falha de autenticação: ${errText(msg)}`;
      console.error('[WhatsApp]', lastError);
    });

    client.on('disconnected', (reason) => {
      ready = false;
      starting = false;
      me = null;
      lastError = `Desconectado: ${errText(reason)}`;
      console.warn('[WhatsApp]', lastError);
    });

    client.initialize().catch(async (e) => {
      starting = false;
      ready = false;
      lastFailureAt = Date.now();
      lastError = errText(e);
      console.error('[WhatsApp] Erro ao inicializar:', lastError);
      if (e && e.stack) console.error(e.stack);
      await destroyClient();
    });

    return { success: true, status: 'starting' };
  } catch (e) {
    starting = false;
    lastFailureAt = Date.now();
    lastError = errText(e);
    console.error('[WhatsApp] Erro ao criar cliente:', lastError);
    await destroyClient();
    return { success: false, error: lastError };
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
    browserPath: lastBrowserPath,
    error: lastError || loadError,
  };
}

// Aguarda um tempo antes de tentar reconectar sozinho após uma falha,
// evitando abrir vários navegadores seguidos. O botão "Conectar" ignora isso.
const RETRY_COOLDOWN_MS = 60 * 1000;

async function ensureReady() {
  if (ready) return true;
  if (!Client) return false;
  if (Date.now() - lastFailureAt < RETRY_COOLDOWN_MS) return false;
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
    return { success: false, error: errText(e) };
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
  // Garante que o navegador seja encerrado, evitando lock na pasta de sessão.
  await destroyClient();
  ready = false;
  starting = false;
  me = null;
  lastQr = null;
  lastError = null;
  lastFailureAt = 0;
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
