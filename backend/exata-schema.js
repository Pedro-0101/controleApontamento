/**
 * Migrações idempotentes da integração ExataWeb.
 *
 * Todas as operações verificam o estado atual em `information_schema` antes de
 * alterar, para que a inicialização do backend possa rodar repetidamente sem
 * erro e sem duplicar colunas/índices.
 */

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(String(value))) {
    throw new Error(`Identificador inválido: ${value}`);
  }
  return `\`${value}\``;
}

async function tableExists(pool, table) {
  const [rows] = await pool.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function columnInfo(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT is_nullable, column_type
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1`,
    [table, column]
  );
  return rows[0] || null;
}

async function addColumnIfMissing(pool, table, column, definition) {
  const info = await columnInfo(pool, table, column);
  if (info) return false;

  await pool.query(
    `ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${definition}`
  );
  return true;
}

async function indexExists(pool, table, indexName) {
  const [rows] = await pool.query(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
      LIMIT 1`,
    [table, indexName]
  );
  return rows.length > 0;
}

async function addIndexIfMissing(pool, table, indexName, definition) {
  if (await indexExists(pool, table, indexName)) return false;
  await pool.query(
    `ALTER TABLE ${quoteIdentifier(table)} ADD ${definition}`
  );
  return true;
}

async function ensureEmpresasConfigSchema(pool) {
  await addColumnIfMissing(
    pool,
    'empresas_config',
    'provedor',
    "VARCHAR(20) NOT NULL DEFAULT 'pontocertificado'"
  );
}

async function ensureEmpresasExataSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empresas_exata (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      empresa_config_id   INT NOT NULL,
      empresasistema      INT NOT NULL,
      empresacliente      INT NULL,
      descricao           VARCHAR(255) NULL,
      empresa_org_erp     VARCHAR(100) NULL,
      filial_estabe_erp   VARCHAR(100) NULL,
      deposito_req_interna VARCHAR(100) NULL,
      empresa_id          INT NULL,
      ativo               TINYINT(1) NOT NULL DEFAULT 1,
      sincronizado_em     DATETIME NULL,
      criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_empresa_exata (empresa_config_id, empresasistema),
      INDEX idx_empresa_exata_local (empresa_id),
      INDEX idx_empresa_exata_ativo (ativo)
    )
  `);
}

async function ensureFuncionarioExataSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funcionario_exata (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      empresa_config_id   INT NOT NULL,
      empresasistema      INT NOT NULL,
      matricula           VARCHAR(50) NOT NULL,
      pis                 VARCHAR(20) NULL,
      cpf                 VARCHAR(20) NULL,
      codturma            VARCHAR(50) NULL,
      descricao_turma     VARCHAR(255) NULL,
      cartao              VARCHAR(50) NULL,
      nome                VARCHAR(255) NULL,
      email               VARCHAR(255) NULL,
      cod_erp             VARCHAR(50) NULL,
      centro_custo        VARCHAR(50) NULL,
      cod_funcao          VARCHAR(50) NULL,
      cod_setor           VARCHAR(50) NULL,
      desc_setor          VARCHAR(255) NULL,
      admissao            DATE NULL,
      intervalo_minimo    INT NULL,
      status              VARCHAR(50) NULL,
      status_inicio       DATETIME NULL,
      status_fim          DATETIME NULL,
      ultima_modificacao  DATETIME NULL,
      criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_funcionario_exata (empresa_config_id, empresasistema, matricula),
      INDEX idx_funcionario_exata_nome (nome),
      INDEX idx_funcionario_exata_cpf (cpf),
      INDEX idx_funcionario_exata_pis (pis)
    )
  `);
}

async function ensureMarcacoesPontoSchema(pool) {
  if (!(await tableExists(pool, 'marcacoes_ponto'))) return;

  // A Exata não devolve id de marcação; a identidade é (empresasistema, reppid, nsr).
  const marcacaoId = await columnInfo(pool, 'marcacoes_ponto', 'marcacao_id');
  if (marcacaoId && String(marcacaoId.is_nullable).toUpperCase() === 'NO') {
    await pool.query('ALTER TABLE marcacoes_ponto MODIFY COLUMN marcacao_id BIGINT NULL');
  }

  await addColumnIfMissing(
    pool,
    'marcacoes_ponto',
    'provedor',
    "VARCHAR(20) NOT NULL DEFAULT 'pontocertificado'"
  );
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'empresasistema', 'INT NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'reppid', 'INT NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'coletor', 'VARCHAR(50) NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'turma', 'VARCHAR(50) NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'hash', 'VARCHAR(255) NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'registro', 'LONGTEXT NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'tipo_coletor', 'VARCHAR(20) NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'data_hora_coleta', 'DATETIME NULL');
  await addColumnIfMissing(pool, 'marcacoes_ponto', 'status_exportacao', 'VARCHAR(20) NULL');

  await addIndexIfMissing(
    pool,
    'marcacoes_ponto',
    'uk_exata_marcacao',
    'UNIQUE KEY `uk_exata_marcacao` (`empresa_config_id`, `empresasistema`, `reppid`, `nsr`)'
  );
  await addIndexIfMissing(
    pool,
    'marcacoes_ponto',
    'idx_marcacoes_provedor',
    'INDEX `idx_marcacoes_provedor` (`provedor`)'
  );
}

async function ensureMarcacaoSyncEstadoExataSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marcacao_sync_estado_exata (
      empresa_config_id   INT NOT NULL,
      empresasistema      INT NOT NULL,
      ultima_data         DATE NULL,
      ultimo_nsr          BIGINT NOT NULL DEFAULT 0,
      ultimo_reppid       INT NULL,
      ultima_execucao_em  DATETIME NULL,
      ultimo_total        INT NOT NULL DEFAULT 0,
      PRIMARY KEY (empresa_config_id, empresasistema)
    )
  `);
}

/**
 * Aplica todas as migrações da Exata. Deve ser chamada depois que
 * `empresas_config` e `marcacoes_ponto` já existem.
 */
async function ensureExataSchema(pool) {
  await ensureEmpresasConfigSchema(pool);
  await ensureEmpresasExataSchema(pool);
  await ensureFuncionarioExataSchema(pool);
  await ensureMarcacoesPontoSchema(pool);
  await ensureMarcacaoSyncEstadoExataSchema(pool);
}

module.exports = {
  ensureExataSchema,
  ensureEmpresasConfigSchema,
  ensureEmpresasExataSchema,
  ensureFuncionarioExataSchema,
  ensureMarcacoesPontoSchema,
  ensureMarcacaoSyncEstadoExataSchema,
  addColumnIfMissing,
  addIndexIfMissing,
  tableExists,
};
