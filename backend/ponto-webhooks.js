'use strict';

/**
 * Fase 5 — Webhooks da API Ponto Certificado.
 *
 * Responsabilidades:
 *  - Criar, listar e atualizar assinaturas de webhook por empresa da API,
 *    usando o token centralizado (`pontoApi.callOperation`).
 *  - Persistir as assinaturas locais (incluindo o `secret`, que é a chave de
 *    validação do callback público).
 *  - Receber os callbacks da API externa em uma rota pública, validar o
 *    `secret`, armazenar o evento e registrar auditoria.
 *
 * Observação: a API externa exige uma URL pública HTTPS acessível por ela.
 * O caminho de callback é `/api/webhooks/ponto/<secret>`.
 */

const CALLBACK_PATH = '/api/webhooks/ponto';

function normalizeTipo(value) {
  return String(value ?? '').trim();
}

function validateWebhookUri(value) {
  const uri = String(value ?? '').trim();
  if (!uri) throw new Error('Informe a URL do webhook');
  if (!/^https:\/\//i.test(uri)) {
    throw new Error('A URL do webhook deve ser pública e usar HTTPS');
  }
  try {
    new URL(uri);
  } catch {
    throw new Error('URL de webhook inválida');
  }
  return uri;
}

function serializarRespostaWebhook(resposta) {
  if (typeof resposta === 'string') {
    throw new Error(resposta);
  }
  if (!resposta || typeof resposta !== 'object') {
    throw new Error('Resposta inválida da API de webhooks');
  }

  const secret = String(resposta.secret ?? '').trim();
  if (!secret) {
    throw new Error('A API não retornou o secret da assinatura');
  }

  return {
    webhook_id: resposta.id !== undefined && resposta.id !== null ? Number(resposta.id) : null,
    publisher: resposta.publisher ? String(resposta.publisher) : null,
    secret,
    webhook_type: normalizeTipo(resposta.webhookType || resposta.webhook_type),
    webhook_uri: String(resposta.webhookURI || resposta.webhook_uri || '').trim(),
  };
}

function createPontoWebhooks({ pool, pontoApi }) {
  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_assinatura (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        empresa_config_id   INT NOT NULL,
        empresa_config_nome VARCHAR(255) NOT NULL,
        webhook_id          INT NULL,
        publisher           VARCHAR(255) NULL,
        secret              VARCHAR(255) NOT NULL,
        webhook_type        VARCHAR(100) NOT NULL DEFAULT '',
        webhook_uri         VARCHAR(2048) NOT NULL,
        ativo               TINYINT(1) NOT NULL DEFAULT 1,
        ultimo_evento_em    DATETIME NULL,
        total_eventos       INT NOT NULL DEFAULT 0,
        criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_webhook_secret (secret),
        INDEX idx_webhook_empresa (empresa_config_id),
        INDEX idx_webhook_ativo (ativo)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_evento (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        assinatura_id       INT NULL,
        empresa_config_id   INT NULL,
        empresa_config_nome VARCHAR(255) NULL,
        secret              VARCHAR(255) NOT NULL,
        tipo_evento         VARCHAR(100) NULL,
        payload             LONGTEXT NULL,
        headers             LONGTEXT NULL,
        origem_ip           VARCHAR(100) NULL,
        recebido_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
        processado          TINYINT(1) NOT NULL DEFAULT 0,
        processado_em       DATETIME NULL,
        erro                TEXT NULL,
        INDEX idx_webhook_evento_recebido (recebido_em),
        INDEX idx_webhook_evento_secret (secret),
        INDEX idx_webhook_evento_empresa (empresa_config_id)
      )
    `);
  }

  async function loadCompanies(companyIds) {
    const ids = Array.isArray(companyIds)
      ? companyIds.map(Number).filter(Number.isFinite)
      : [];

    if (ids.length > 0) {
      const [rows] = await pool.query(
        `SELECT id, nome, email, senha, chave, ativo, empresa_id
         FROM empresas_config
         WHERE ativo = 1 AND id IN (?)
         ORDER BY nome ASC`,
        [ids]
      );
      return rows;
    }

    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, chave, ativo, empresa_id
       FROM empresas_config
       WHERE ativo = 1
       ORDER BY nome ASC`
    );
    return rows;
  }

  async function loadCompany(companyId) {
    const id = Number(companyId);
    if (!Number.isFinite(id)) throw new Error('Informe a empresa da API');
    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, chave, ativo, empresa_id
       FROM empresas_config
       WHERE id = ? AND ativo = 1
       LIMIT 1`,
      [id]
    );
    if (rows.length === 0) throw new Error('Empresa da API não encontrada ou inativa');
    return rows[0];
  }

  async function upsertAssinatura(company, resposta) {
    await pool.query(
      `INSERT INTO webhook_assinatura
         (empresa_config_id, empresa_config_nome, webhook_id, publisher, secret,
          webhook_type, webhook_uri, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         empresa_config_id = VALUES(empresa_config_id),
         empresa_config_nome = VALUES(empresa_config_nome),
         webhook_id = VALUES(webhook_id),
         publisher = VALUES(publisher),
         webhook_type = VALUES(webhook_type),
         webhook_uri = VALUES(webhook_uri),
         ativo = 1,
         atualizado_em = NOW()`,
      [
        company.id,
        company.nome,
        resposta.webhook_id,
        resposta.publisher,
        resposta.secret,
        resposta.webhook_type,
        resposta.webhook_uri,
      ]
    );

    const [rows] = await pool.query(
      'SELECT * FROM webhook_assinatura WHERE secret = ? LIMIT 1',
      [resposta.secret]
    );
    return rows[0];
  }

  async function criarAssinatura({
    empresaConfigId,
    webhookType,
    webhookUri,
    callbackBaseUrl,
    usuario = null,
  }) {
    await ensureSchema();

    const company = await loadCompany(empresaConfigId);
    const uri = validateWebhookUri(webhookUri);
    const tipo = normalizeTipo(webhookType);
    if (!tipo) throw new Error('Informe o tipo do webhook');

    const resposta = await pontoApi.callOperation(company, 'WebhookSubscription', {
      webhookURI: uri,
      webhookType: tipo,
    });

    const normalizada = serializarRespostaWebhook(resposta);
    if (!normalizada.webhook_uri) normalizada.webhook_uri = uri;
    if (!normalizada.webhook_type) normalizada.webhook_type = tipo;

    // O secret só é conhecido depois da assinatura. Para que o callback seja
    // validável sem depender de headers proprietários da API externa,
    // registra-se a URL definitiva contendo o secret.
    let aviso = null;
    if (callbackBaseUrl) {
      const callbackUri = `${String(callbackBaseUrl).replace(/\/+$/, '')}/api/webhooks/ponto/${normalizada.secret}`;
      try {
        const atualizacao = await pontoApi.callOperation(company, 'UpdateWebhookURI', {
          secret: normalizada.secret,
          webhookURI: callbackUri,
        });
        const atualizada = serializarRespostaWebhook(atualizacao);
        normalizada.webhook_uri = atualizada.webhook_uri || callbackUri;
      } catch (error) {
        aviso = `Assinatura criada, mas não foi possível registrar automaticamente a URL de callback: ${error?.message || error}`;
        console.warn('[Webhooks]', aviso);
      }
    }

    const assinatura = await upsertAssinatura(company, normalizada);

    await registrarAuditoria({
      usuario,
      acao: 'WEBHOOK_CRIAR',
      registroId: assinatura.id,
      dadosNovos: {
        empresa_config_id: company.id,
        webhook_type: normalizada.webhook_type,
        webhook_uri: normalizada.webhook_uri,
      },
    });

    return { ...assinatura, aviso };
  }

  async function listarAssinaturas({ empresaConfigIds } = {}) {
    await ensureSchema();
    const ids = Array.isArray(empresaConfigIds)
      ? empresaConfigIds.map(Number).filter(Number.isFinite)
      : [];

    const where = [];
    const params = [];
    if (ids.length > 0) {
      where.push('empresa_config_id IN (?)');
      params.push(ids);
    }

    const [rows] = await pool.query(
      `SELECT id, empresa_config_id, empresa_config_nome, webhook_id, publisher,
              secret, webhook_type, webhook_uri, ativo, ultimo_evento_em,
              total_eventos, criado_em, atualizado_em
       FROM webhook_assinatura
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY empresa_config_nome ASC, id ASC`,
      params
    );

    return rows;
  }

  async function sincronizarAssinaturas({ empresaConfigIds, usuario = null } = {}) {
    await ensureSchema();
    const companies = await loadCompanies(empresaConfigIds);
    if (companies.length === 0) {
      throw new Error('Nenhuma empresa de API ativa encontrada');
    }

    const resultados = [];
    let total = 0;

    for (const company of companies) {
      const resultado = {
        empresa_config_id: company.id,
        nome: company.nome,
        assinaturas: 0,
        erro: null,
      };

      try {
        const resposta = await pontoApi.callOperation(company, 'GetSubscriptions', {});
        if (typeof resposta === 'string') throw new Error(resposta);
        if (resposta !== null && resposta !== undefined && !Array.isArray(resposta)) {
          throw new Error('Resposta inválida de GetSubscriptions');
        }

        for (const item of resposta || []) {
          const normalizada = serializarRespostaWebhook(item);
          if (!normalizada.webhook_uri || !normalizada.webhook_type) {
            // Alguns itens antigos podem vir incompletos; preserva o que existe
            // localmente, se houver.
            const [existentes] = await pool.query(
              'SELECT webhook_uri, webhook_type FROM webhook_assinatura WHERE secret = ? LIMIT 1',
              [normalizada.secret]
            );
            const existente = existentes[0] || {};
            normalizada.webhook_uri = normalizada.webhook_uri || existente.webhook_uri || '';
            normalizada.webhook_type = normalizada.webhook_type || existente.webhook_type || '';
          }
          await upsertAssinatura(company, normalizada);
          resultado.assinaturas++;
          total++;
        }
      } catch (error) {
        resultado.erro = error?.message || String(error);
      }

      resultados.push(resultado);
    }

    const erros = resultados.filter((item) => item.erro).length;
    await registrarAuditoria({
      usuario,
      acao: 'WEBHOOK_SINCRONIZAR',
      registroId: null,
      dadosNovos: { total, empresas: resultados.length },
    });

    return {
      success: erros === 0,
      total,
      erros,
      empresas: resultados,
    };
  }

  async function atualizarUri({ id, webhookUri, usuario = null }) {
    await ensureSchema();

    const assinaturaId = Number(id);
    if (!Number.isFinite(assinaturaId)) throw new Error('Assinatura inválida');

    const [rows] = await pool.query(
      'SELECT * FROM webhook_assinatura WHERE id = ? LIMIT 1',
      [assinaturaId]
    );
    if (rows.length === 0) throw new Error('Assinatura de webhook não encontrada');

    const assinatura = rows[0];
    const company = await loadCompany(assinatura.empresa_config_id);
    const uri = validateWebhookUri(webhookUri);

    const resposta = await pontoApi.callOperation(company, 'UpdateWebhookURI', {
      secret: assinatura.secret,
      webhookURI: uri,
    });

    const normalizada = serializarRespostaWebhook(resposta);
    if (!normalizada.webhook_uri) normalizada.webhook_uri = uri;
    if (!normalizada.webhook_type) normalizada.webhook_type = assinatura.webhook_type;

    await upsertAssinatura(company, normalizada);

    await registrarAuditoria({
      usuario,
      acao: 'WEBHOOK_ATUALIZAR',
      registroId: assinaturaId,
      dadosAntigos: { webhook_uri: assinatura.webhook_uri },
      dadosNovos: { webhook_uri: uri },
    });

    const [atualizadas] = await pool.query(
      'SELECT * FROM webhook_assinatura WHERE id = ? LIMIT 1',
      [assinaturaId]
    );
    return atualizadas[0];
  }

  async function consultarPorSecret({ empresaConfigId, secret }) {
    await ensureSchema();
    const company = await loadCompany(empresaConfigId);
    const chave = String(secret ?? '').trim();
    if (!chave) throw new Error('Informe o secret');

    const resposta = await pontoApi.callOperation(company, 'GetSubscriptionBySecret', {
      secret: chave,
    });
    return serializarRespostaWebhook(resposta);
  }

  async function desativarAssinatura({ id, usuario = null }) {
    await ensureSchema();
    const assinaturaId = Number(id);
    if (!Number.isFinite(assinaturaId)) throw new Error('Assinatura inválida');

    const [rows] = await pool.query(
      'SELECT * FROM webhook_assinatura WHERE id = ? LIMIT 1',
      [assinaturaId]
    );
    if (rows.length === 0) throw new Error('Assinatura de webhook não encontrada');

    await pool.query(
      'UPDATE webhook_assinatura SET ativo = 0, atualizado_em = NOW() WHERE id = ?',
      [assinaturaId]
    );

    await registrarAuditoria({
      usuario,
      acao: 'WEBHOOK_DESATIVAR',
      registroId: assinaturaId,
      dadosAntigos: { ativo: rows[0].ativo },
      dadosNovos: { ativo: 0 },
    });

    const [atualizadas] = await pool.query(
      'SELECT * FROM webhook_assinatura WHERE id = ? LIMIT 1',
      [assinaturaId]
    );
    return atualizadas[0];
  }

  function extrairTipoEvento(payload, headers) {
    const headerTipo = headers?.['x-webhook-type'] || headers?.['x-event-type'] || headers?.['event-type'];
    if (headerTipo) return normalizeTipo(headerTipo).slice(0, 100);

    if (payload && typeof payload === 'object') {
      const candidatos = [
        payload.eventType,
        payload.event_type,
        payload.tipo,
        payload.type,
        payload.webhookType,
        payload.event,
      ];
      const encontrado = candidatos.find((valor) => typeof valor === 'string' && valor.trim());
      if (encontrado) return normalizeTipo(encontrado).slice(0, 100);
    }

    return null;
  }

  /**
   * Recebe um callback público. Valida o secret contra as assinaturas locais
   * ativas, grava o evento e atualiza os contadores da assinatura.
   */
  async function registrarEvento({ secret, payload, headers = {}, origemIp = null }) {
    await ensureSchema();

    const chave = String(secret ?? '').trim();
    if (!chave) {
      const error = new Error('Secret do webhook ausente');
      error.statusCode = 400;
      throw error;
    }

    const [rows] = await pool.query(
      'SELECT * FROM webhook_assinatura WHERE secret = ? AND ativo = 1 LIMIT 1',
      [chave]
    );
    if (rows.length === 0) {
      const error = new Error('Assinatura de webhook inválida ou inativa');
      error.statusCode = 404;
      throw error;
    }

    const assinatura = rows[0];
    const tipoEvento = extrairTipoEvento(payload, headers);
    let payloadTexto = null;

    try {
      payloadTexto = payload === undefined ? null : JSON.stringify(payload);
    } catch {
      payloadTexto = String(payload);
    }

    let headersTexto = null;
    try {
      headersTexto = JSON.stringify(headers || {});
    } catch {
      headersTexto = null;
    }

    const [result] = await pool.query(
      `INSERT INTO webhook_evento
         (assinatura_id, empresa_config_id, empresa_config_nome, secret,
          tipo_evento, payload, headers, origem_ip, processado, processado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        assinatura.id,
        assinatura.empresa_config_id,
        assinatura.empresa_config_nome,
        chave,
        tipoEvento,
        payloadTexto,
        headersTexto,
        origemIp,
      ]
    );

    await pool.query(
      `UPDATE webhook_assinatura
       SET ultimo_evento_em = NOW(), total_eventos = total_eventos + 1
       WHERE id = ?`,
      [assinatura.id]
    );

    await registrarAuditoria({
      usuario: null,
      acao: 'WEBHOOK_RECEBER',
      registroId: result.insertId,
      dadosNovos: {
        empresa_config_id: assinatura.empresa_config_id,
        tipo_evento: tipoEvento,
        origem_ip: origemIp,
      },
    });

    return {
      id: result.insertId,
      assinatura_id: assinatura.id,
      empresa_config_id: assinatura.empresa_config_id,
      tipo_evento: tipoEvento,
    };
  }

  async function listarEventos({ limit = 50, empresaConfigIds, secret } = {}) {
    await ensureSchema();
    const limite = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const where = [];
    const params = [];

    const ids = Array.isArray(empresaConfigIds)
      ? empresaConfigIds.map(Number).filter(Number.isFinite)
      : [];
    if (ids.length > 0) {
      where.push('empresa_config_id IN (?)');
      params.push(ids);
    }
    if (secret) {
      where.push('secret = ?');
      params.push(String(secret));
    }

    const [rows] = await pool.query(
      `SELECT id, assinatura_id, empresa_config_id, empresa_config_nome, secret,
              tipo_evento, payload, origem_ip, recebido_em, processado, erro
       FROM webhook_evento
       ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limite]
    );

    return rows.map((row) => ({
      ...row,
      payload_preview: row.payload
        ? (row.payload.length > 500 ? `${row.payload.slice(0, 500)}…` : row.payload)
        : '',
    }));
  }

  async function registrarAuditoria({ usuario, acao, registroId, dadosAntigos, dadosNovos }) {
    try {
      await pool.query(
        `INSERT INTO audit_log
           (usuario, acao, tabela, registro_id, dados_antigos, dados_novos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          usuario || null,
          acao,
          'webhook_assinatura',
          registroId || null,
          dadosAntigos ? JSON.stringify(dadosAntigos) : null,
          dadosNovos ? JSON.stringify(dadosNovos) : null,
        ]
      );
    } catch (error) {
      console.warn('[Webhooks] Não foi possível registrar auditoria:', error.message);
    }
  }

  return {
    ensureSchema,
    criarAssinatura,
    listarAssinaturas,
    sincronizarAssinaturas,
    atualizarUri,
    consultarPorSecret,
    desativarAssinatura,
    registrarEvento,
    listarEventos,
    CALLBACK_PATH,
  };
}

module.exports = {
  createPontoWebhooks,
  CALLBACK_PATH,
};
