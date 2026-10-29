'use strict';

/**
 * Integração com WhatsApp via whatsapp-web.js (não oficial, sem custo).
 *
 * A sessão é persistida em disco (.wwebjs_auth), então basta escanear o QR Code
 * uma vez. Se a biblioteca não estiver instalada, o módulo degrada de forma
 * silenciosa e o restante do sistema continua funcionando normalmente.
 *
 * Por que existe um "watchdog": o whatsapp-web.js abre o navegador e chama
 * page.goto('https://web.whatsapp.com', { timeout: 0 }). Se a rede/proxy
 * travar, esse await nunca resolve e o cliente fica eternamente em "starting",
 * sem QR Code e sem erro. Os timers abaixo transformam esse travamento em um
 * erro visível + encerramento do navegador, permitindo tentar de novo.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');
const SESSION_DIR = path.join(AUTH_DIR, 'session');

// Tempos (configuráveis por variável de ambiente, em ms).
function envMs(name, fallback, min) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(min, Math.round(raw));
}

const INIT_TIMEOUT_MS = envMs('WHATSAPP_INIT_TIMEOUT_MS', 90000, 20000); // abrir navegador + carregar página
const QR_TIMEOUT_MS = envMs('WHATSAPP_QR_TIMEOUT_MS', 60000, 20000); // página carregada, mas sem QR
const AUTH_TIMEOUT_MS = envMs('WHATSAPP_AUTH_TIMEOUT_MS', 180000, 30000); // QR exibido, aguardando leitura
const CLOSE_TIMEOUT_MS = envMs('WHATSAPP_CLOSE_TIMEOUT_MS', 12000, 2000);

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

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => {
      log('warn', `[WhatsApp] ${label} demorou mais de ${Math.round(ms / 1000)}s; seguindo em frente.`);
      resolve('timeout');
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), guard]).finally(() => clearTimeout(timer));
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
      const browser = await puppeteerLib.launch({ ...cfg, timeout: 25000 });
      await withTimeout(browser.close(), 5000, 'Fechamento do navegador de teste');
      workingConfig = cfg;
      log('log', `[WhatsApp] Config de navegador OK: ${label}`);
      return cfg;
    } catch (e) {
      log('warn', `[WhatsApp] Config falhou (${label}): ${errText(e)}`);
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
let lastErrorAt = null;
let me = null;
let lastBrowserPath = null;
let lastFailureAt = 0;
let stage = 'parado';
let startedAt = null;
let watchdog = null;
// Cada init/restart/logout incrementa a geração. Callbacks de um cliente antigo
// (que pode terminar de inicializar depois de um destroy) são ignorados.
let generation = 0;

const LOG_LIMIT = 40;
const logs = [];

function log(level, message) {
  const entry = { at: new Date().toISOString(), level, message };
  logs.push(entry);
  if (logs.length > LOG_LIMIT) logs.shift();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(message);
}

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
 * WhatsApp. Sem isso, o puppeteer no Windows acusa "The browser is already
 * running" ou fica preso porque o perfil está bloqueado por outro processo.
 */
function killSessionBrowsers() {
  if (process.platform !== 'win32') return;
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

/**
 * Remove arquivos de lock deixados por execuções anteriores.
 */
function clearLockFiles() {
  const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const name of lockFiles) {
    try {
      fs.rmSync(path.join(SESSION_DIR, name), { force: true });
    } catch {
      /* ignora */
    }
  }
}

function prepareSessionDir() {
  killSessionBrowsers();
  clearLockFiles();
}

function clearWatchdog() {
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

function armWatchdog(ms, message, gen = generation) {
  clearWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    // Um reinício/login pode ter acontecido enquanto o timer estava armado.
    if (gen !== generation) return;
    failInit(message).catch(() => {});
  }, ms);
}

/**
 * Marca a inicialização como falha, encerra o navegador e libera a sessão para
 * uma nova tentativa. É o que evita o "fica parado em Iniciando navegador".
 */
async function failInit(message) {
  clearWatchdog();
  starting = false;
  ready = false;
  lastFailureAt = Date.now();
  lastError = message;
  lastErrorAt = new Date().toISOString();
  stage = 'falhou';
  // O QR anterior morre junto com o navegador; não deixe a tela exibir um
  // código que já não pode ser lido.
  lastQr = null;
  lastQrAt = null;
  log('error', `[WhatsApp] ${message}`);
  await destroyClient({ force: true });
}

async function destroyClient({ force = false } = {}) {
  const c = client;
  client = null;
  if (c) {
    try {
      await withTimeout(c.destroy(), CLOSE_TIMEOUT_MS, 'Fechamento do navegador');
    } catch (e) {
      log('warn', `[WhatsApp] Erro ao fechar navegador: ${errText(e)}`);
    }
  }
  if (force) {
    killSessionBrowsers();
    clearLockFiles();
  }
}

async function init({ force = false } = {}) {
  if (!Client) {
    return { success: false, error: loadError || 'Integração indisponível', stage };
  }
  if (ready) return { success: true, status: 'ready', stage };
  if (starting && !force) return { success: true, status: 'starting', stage };

  // Instância anterior que não chegou a ficar pronta: descarta e recria do zero,
  // evitando erros ao reinicializar um cliente já quebrado.
  if (client) {
    await destroyClient({ force: true });
  }

  clearWatchdog();
  const gen = ++generation;
  starting = true;
  ready = false;
  lastError = null;
  lastErrorAt = null;
  lastQr = null;
  lastQrAt = null;
  stage = 'abrindo navegador';
  startedAt = new Date().toISOString();

  try {
    // Remove locks/navegadores órfãos que impediriam a abertura da sessão.
    prepareSessionDir();

    const config = await findWorkingConfig();
    if (gen !== generation) return { success: true, status: 'starting', stage };
    lastBrowserPath = (config && config.executablePath) || null;
    stage = 'iniciando navegador';
    log(
      'log',
      `[WhatsApp] Iniciando navegador${lastBrowserPath ? ` (${lastBrowserPath})` : ' (Chromium do puppeteer)'}...`
    );

    const c = new Client({
      authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
      authTimeoutMs: AUTH_TIMEOUT_MS,
      puppeteer: {
        ...(config || { headless: true, args: BROWSER_ARGS }),
        // Faz o protocolo do puppeteer falhar em vez de ficar pendurado para
        // sempre quando a página do WhatsApp Web para de responder.
        protocolTimeout: 90000,
        dumpio: process.env.WHATSAPP_DEBUG === '1',
      },
    });
    client = c;

    const isCurrent = () => gen === generation;

    c.on('qr', (qr) => {
      if (!isCurrent()) return;
      lastQr = qr;
      lastQrAt = new Date().toISOString();
      if (!ready) {
        stage = 'aguardando leitura do QR Code';
        // O QR é renovado algumas vezes; o timer é reagendado a cada um.
        armWatchdog(
          AUTH_TIMEOUT_MS,
          `O QR Code não foi lido em ${Math.round(AUTH_TIMEOUT_MS / 1000)}s. ` +
            'Clique em "Reiniciar WhatsApp" para gerar um novo.'
        );
      }
      log('log', '[WhatsApp] QR Code gerado. Aguardando leitura pelo celular.');
    });

    c.on('loading_screen', (percent, message) => {
      if (!isCurrent() || ready) return;
      const p = Number(percent) || 0;
      stage = `carregando WhatsApp Web (${p}%${message ? ` — ${message}` : ''})`;
    });

    c.on('ready', () => {
      if (!isCurrent()) return;
      clearWatchdog();
      ready = true;
      starting = false;
      stage = 'conectado';
      lastQr = null;
      lastError = null;
      try {
        me = c.info?.wid?._serialized || c.info?.pushname || null;
      } catch {
        me = null;
      }
      log('log', '[WhatsApp] Cliente conectado e pronto para envio.');
    });

    c.on('auth_failure', (msg) => {
      if (!isCurrent()) return;
      clearWatchdog();
      starting = false;
      ready = false;
      stage = 'falha de autenticação';
      lastError = `Falha de autenticação: ${errText(msg)}`;
      lastErrorAt = new Date().toISOString();
      log('error', `[WhatsApp] ${lastError}`);
    });

    c.on('disconnected', (reason) => {
      if (!isCurrent()) return;
      clearWatchdog();
      ready = false;
      starting = false;
      me = null;
      stage = 'desconectado';
      lastError = `Desconectado: ${errText(reason)}`;
      lastErrorAt = new Date().toISOString();
      log('warn', `[WhatsApp] ${lastError}`);
    });

    stage = 'carregando WhatsApp Web';
    armWatchdog(
      INIT_TIMEOUT_MS,
      `O navegador não terminou de carregar o WhatsApp Web em ${Math.round(INIT_TIMEOUT_MS / 1000)}s. ` +
        'Verifique a conexão com a internet/proxy e clique em "Reiniciar WhatsApp".'
    );

    c.initialize()
      .then(() => {
        if (!isCurrent() || ready) return;
        if (lastQr) {
          stage = 'aguardando leitura do QR Code';
          armWatchdog(
            AUTH_TIMEOUT_MS,
            `O QR Code não foi lido em ${Math.round(AUTH_TIMEOUT_MS / 1000)}s. ` +
              'Clique em "Reiniciar WhatsApp" para gerar um novo.'
          );
        } else {
          stage = 'aguardando QR Code';
          armWatchdog(
            QR_TIMEOUT_MS,
            `O WhatsApp Web carregou, mas nenhum QR Code foi gerado em ${Math.round(QR_TIMEOUT_MS / 1000)}s. ` +
              'Clique em "Reiniciar WhatsApp" para tentar novamente.'
          );
        }
      })
      .catch(async (e) => {
        if (!isCurrent()) return;
        await failInit(`Erro ao inicializar: ${errText(e)}`);
        if (e && e.stack) log('error', e.stack);
      });

    return { success: true, status: 'starting', stage };
  } catch (e) {
    starting = false;
    lastFailureAt = Date.now();
    lastError = errText(e);
    lastErrorAt = new Date().toISOString();
    stage = 'falhou';
    log('error', `[WhatsApp] Erro ao criar cliente: ${lastError}`);
    await destroyClient({ force: true });
    return { success: false, error: lastError, stage };
  }
}

/**
 * Reinício completo, solicitado pelo botão da interface: encerra o navegador
 * (mesmo que esteja travado), limpa locks, revalida o navegador e inicia de novo.
 */
async function restart() {
  log('log', '[WhatsApp] Reinício solicitado pela interface...');
  generation++;
  clearWatchdog();
  starting = false;
  ready = false;
  me = null;
  lastQr = null;
  lastQrAt = null;
  lastError = null;
  lastErrorAt = null;
  lastFailureAt = 0;
  stage = 'reiniciando';
  startedAt = new Date().toISOString();

  await destroyClient({ force: true });
  prepareSessionDir();
  // Revalida qual navegador consegue abrir; pode ter sido atualizado/quebrado.
  workingConfig = null;

  return init({ force: true });
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
    stage,
    startedAt,
    elapsedMs: starting && startedAt ? Date.now() - Date.parse(startedAt) : null,
    hasQr: !!lastQr,
    qr: lastQr,
    qrDataUrl,
    qrAt: lastQrAt,
    me,
    browserPath: lastBrowserPath,
    error: lastError || loadError,
    errorAt: lastErrorAt,
    logs: logs.slice(-15),
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
  generation++;
  clearWatchdog();
  try {
    if (client) await withTimeout(client.logout(), CLOSE_TIMEOUT_MS, 'Logout do WhatsApp');
  } catch {
    /* ignora */
  }
  // Garante que o navegador seja encerrado, evitando lock na pasta de sessão.
  await destroyClient({ force: true });
  ready = false;
  starting = false;
  me = null;
  lastQr = null;
  lastQrAt = null;
  lastError = null;
  lastErrorAt = null;
  lastFailureAt = 0;
  stage = 'desconectado';
  return { success: true };
}

module.exports = {
  isAvailable,
  init,
  restart,
  getStatus,
  ensureReady,
  sendMessage,
  sendToMany,
  logout,
  normalizeNumber,
};
