const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3000;

// Configuração do banco de dados
const dbConfig = {
  host: '192.168.200.136',
  port: 3306,
  database: 'dnpmix',
  user: 'root',
  password: 'pass'
};

// Middleware
app.use(cors());

// 1. Configuração do Proxy para a API externa (Ponto Certificado)
// Usamos uma função de filtro para decidir o que vai para o proxy e o que é local
const apiProxy = createProxyMiddleware({
  target: 'https://integrar.pontocertificado.com.br',
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/api': '/Api.svc' // Agora sim o regex vai encontrar o /api no início do path
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[Proxy] ${req.method} ${req.url} -> ${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error('[Proxy Error]', err);
    res.status(504).json({ success: false, error: 'Erro de comunicação com o servidor externo' });
  }
});

// 2. Middleware de roteamento: Proxy vs Local
app.use((req, res, next) => {
  // Se não começar com /api, não é do nosso interesse aqui (vai para estáticos)
  if (!req.url.startsWith('/api')) {
    return next();
  }

  // Lista de prefixos das nossas rotas locais (excluem o /api inicial no teste de string)
  const localPrefixes = ['/api/auth', '/api/comments', '/api/marcacoes', '/api/employee', '/api/employees', '/api/health', '/api/audit-logs'];
  const isLocal = localPrefixes.some(prefix => req.url.startsWith(prefix));
  
  if (isLocal) {
    next(); // Vai para o express.json() e depois para as rotas definidas abaixo
  } else {
    // É uma rota da API externa (ex: /api/StartSession)
    apiProxy(req, res, next);
  }
});

// 3. Parser de JSON (Apenas para rotas locais)
app.use(express.json());

// Pool de conexões
let pool;

async function initializeDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    
    // Criar tabela de auditoria se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(100),
        acao VARCHAR(50),
        tabela VARCHAR(50),
        registro_id INT,
        dados_antigos JSON,
        dados_novos JSON,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_usuario (usuario),
        INDEX idx_acao (acao),
        INDEX idx_tabela (tabela),
        INDEX idx_timestamp (timestamp)
      )
    `);
    
    // Garantir que a coluna acao tenha tamanho suficiente (correção de erro de truncamento)
    await pool.query('ALTER TABLE audit_log MODIFY COLUMN acao VARCHAR(50)');
    console.log('Tabela audit_log verificada/criada com sucesso');

    // Criar tabela de comentários se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comentario_dia (
        id INT AUTO_INCREMENT PRIMARY KEY,
        matricula_funcionario VARCHAR(50) NOT NULL,
        data DATE NOT NULL,
        comentario TEXT NOT NULL,
        criado_por VARCHAR(100),
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_matricula_data (matricula_funcionario, data)
      )
    `);
    console.log('Tabela comentario_dia verificada/criada com sucesso');

    // Criar tabela de pontos manuais se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ponto_manual (
        id INT AUTO_INCREMENT PRIMARY KEY,
        matricula_funcionario VARCHAR(50) NOT NULL,
        data DATE NOT NULL,
        hora TIME NOT NULL,
        criado_por VARCHAR(100),
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_ponto_manual (matricula_funcionario, data, hora)
      )
    `);
    console.log('Tabela ponto_manual verificada/criada com sucesso');
    
    // Criar tabela de eventos/status fixos se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS evento_funcionario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        matricula_funcionario VARCHAR(50) NOT NULL,
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL,
        tipo_evento VARCHAR(50) NOT NULL,
        categoria ENUM('PERIODO', 'FIXO') DEFAULT 'PERIODO',
        criado_por VARCHAR(100),
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_matricula_periodo (matricula_funcionario, data_inicio, data_fim),
        INDEX idx_categoria (categoria)
      )
    `);
    console.log('Tabela evento_funcionario verificada/criada com sucesso');

    // Criar tabela de marcações desconsideradas se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marcacao_desconsiderada (
        id INT AUTO_INCREMENT PRIMARY KEY,
        matricula_funcionario VARCHAR(50) NOT NULL,
        data DATE NOT NULL,
        marcacao_id INT, -- Para pontos manuais
        nsr INT, -- Para pontos automáticos
        relogio_ns VARCHAR(50), -- Para pontos automáticos
        criado_por VARCHAR(100),
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_marcacao (matricula_funcionario, data, marcacao_id, nsr, relogio_ns)
      )
    `);
    console.log('Tabela marcacao_desconsiderada verificada/criada com sucesso');

    console.log('Pool de conexões MySQL criado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
    process.exit(1);
  }
}

// Helper para criar logs de auditoria
async function createAuditLog(usuario, acao, tabela, registroId, dadosAntigos, dadosNovos) {
  try {
    await pool.query(`
      INSERT INTO audit_log (usuario, acao, tabela, registro_id, dados_antigos, dados_novos)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      usuario,
      acao,
      tabela,
      registroId,
      dadosAntigos ? JSON.stringify(dadosAntigos) : null,
      dadosNovos ? JSON.stringify(dadosNovos) : null
    ]);
  } catch (error) {
    console.error('Erro ao criar log de auditoria:', error);
    // Não lançamos erro aqui para não travar a operação principal
  }
}

// Rota para salvar um novo comentário
app.post('/api/comments', async (req, res) => {
  const { matricula, data, comentario, criadoPor } = req.body;

  if (!matricula || !data || !comentario) {
    return res.status(400).json({ success: false, error: 'Matrícula, data e comentário são obrigatórios' });
  }

  try {
    const [result] = await pool.query(`
      INSERT INTO comentario_dia (matricula_funcionario, data, comentario, criado_por)
      VALUES (?, ?, ?, ?)
    `, [matricula, data, comentario, criadoPor]);

    await createAuditLog(criadoPor, 'CREATE', 'comentario_dia', result.insertId, null, { matricula, data, comentario });

    res.json({ success: true, message: 'Comentário salvo com sucesso' });
  } catch (error) {
    console.error('Erro ao salvar comentário:', error);
    res.status(500).json({ success: false, error: 'Erro ao salvar comentário' });
  }
});

// Rota para buscar comentários em lote
app.post('/api/comments/batch', async (req, res) => {
  const { matriculas, dataInicio, dataFim } = req.body;

  if (!Array.isArray(matriculas) || matriculas.length === 0 || !dataInicio || !dataFim) {
    return res.status(400).json({ success: false, error: 'Parâmetros inválidos' });
  }

  try {
    const placeholders = matriculas.map(() => '?').join(',');
    const [rows] = await pool.query(`
      SELECT matricula_funcionario, DATE_FORMAT(data, '%Y-%m-%d') as data, comentario, criado_por, criado_em
      FROM comentario_dia
      WHERE matricula_funcionario IN (${placeholders})
      AND data BETWEEN ? AND ?
      ORDER BY criado_em ASC
    `, [...matriculas, dataInicio, dataFim]);
    res.json({ success: true, comments: rows });
  } catch (error) {
    console.error('Erro ao buscar comentários:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar comentários' });
  }
});

// Rota para salvar ponto manual
app.post('/api/marcacoes/manual', async (req, res) => {
  const { matricula, data, hora, criadoPor } = req.body;

  if (!matricula || !data || !hora) {
    return res.status(400).json({ success: false, error: 'Matrícula, data e hora são obrigatórios' });
  }

  try {
    const [result] = await pool.query(`
      INSERT INTO ponto_manual (matricula_funcionario, data, hora, criado_por)
      VALUES (?, ?, ?, ?)
    `, [matricula, data, hora, criadoPor]);

    await createAuditLog(criadoPor, 'CREATE', 'ponto_manual', result.insertId, null, { matricula, data, hora });

    res.json({ success: true, message: 'Ponto manual inserido com sucesso' });
  } catch (error) {
    console.error('Erro ao inserir ponto manual:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Este ponto já foi inserido' });
    }
    res.status(500).json({ success: false, error: 'Erro ao inserir ponto manual' });
  }
});

// Rota para buscar pontos manuais em lote
app.post('/api/marcacoes/manual/batch', async (req, res) => {
  const { matriculas, dataInicio, dataFim } = req.body;

  if (!Array.isArray(matriculas) || matriculas.length === 0 || !dataInicio || !dataFim) {
    return res.status(400).json({ success: false, error: 'Parâmetros inválidos' });
  }

  try {
    const placeholders = matriculas.map(() => '?').join(',');
    const query = `
      SELECT id, matricula_funcionario, DATE_FORMAT(data, '%Y-%m-%d') as data, TIME_FORMAT(hora, '%H:%i') as hora, criado_por, criado_em
      FROM ponto_manual
      WHERE matricula_funcionario IN (${placeholders})
      AND data BETWEEN ? AND ?
    `;

    const [rows] = await pool.query(query, [...matriculas, dataInicio, dataFim]);
    res.json({ success: true, points: rows });
  } catch (error) {
    console.error('Erro ao buscar pontos manuais:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar pontos manuais' });
  }
});

// Rota para buscar histórico de 7 dias de um funcionário
app.get('/api/employee/:matricula/history', async (req, res) => {
  const { matricula } = req.params;
  
  try {
    // Calcula data de 7 dias atrás
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    const dataFim = today.toISOString().split('T')[0];
    const dataInicio = sevenDaysAgo.toISOString().split('T')[0];
    
    // Nota: Marcações automáticas são buscadas pelo frontend diretamente da API externa
    const marcacoes = [];
    
    // Buscar pontos manuais dos últimos 7 dias
    const [pontosManuais] = await pool.query(
      `SELECT id, DATE_FORMAT(data, '%Y-%m-%d') as data, TIME_FORMAT(hora, '%H:%i') as hora, criado_por, criado_em
       FROM ponto_manual 
       WHERE matricula_funcionario = ? 
       AND data BETWEEN ? AND ?
       ORDER BY data ASC, hora ASC`,
      [matricula, dataInicio, dataFim]
    );
    
    // Buscar comentários dos últimos 7 dias
    const [comentarios] = await pool.query(
      `SELECT DATE_FORMAT(data, '%Y-%m-%d') as data, comentario, criado_por, criado_em
       FROM comentario_dia 
       WHERE matricula_funcionario = ? 
       AND data BETWEEN ? AND ?
       ORDER BY data ASC, criado_em ASC`,
      [matricula, dataInicio, dataFim]
    );

    // Buscar eventos nos últimos 7 dias
    const [eventos] = await pool.query(
      `SELECT id, DATE_FORMAT(data_inicio, '%Y-%m-%d') as data_inicio, DATE_FORMAT(data_fim, '%Y-%m-%d') as data_fim, tipo_evento, criado_por
       FROM evento_funcionario
       WHERE matricula_funcionario = ?
       AND (
         (data_inicio BETWEEN ? AND ?) OR
         (data_fim BETWEEN ? AND ?) OR
         (? BETWEEN data_inicio AND data_fim)
       )`,
      [matricula, dataInicio, dataFim, dataInicio, dataFim, dataInicio]
    );

    // Buscar pontos desconsiderados nos últimos 7 dias
    const [ignoredPoints] = await pool.query(
      `SELECT DATE_FORMAT(data, '%Y-%m-%d') as data, marcacao_id, nsr, relogio_ns
       FROM marcacao_desconsiderada
       WHERE matricula_funcionario = ?
       AND data BETWEEN ? AND ?`,
      [matricula, dataInicio, dataFim]
    );
    
    res.json({
      success: true,
      history: {
        marcacoes,
        pontosManuais,
        comentarios,
        eventos,
        ignoredPoints
      }
    });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar histórico' });
  }
});

// Rota para buscar nome do funcionário por matrícula
app.get('/api/employee/:matricula', async (req, res) => {
  const { matricula } = req.params;
  
  try {
    const [rows] = await pool.query(
      'SELECT id, matricula, empresa, nome, qrcod FROM qrcod_2023 WHERE matricula = ?',
      [matricula]
    );

    if (rows.length > 0) {
      res.json({
        success: true,
        employee: rows[0]
      });
    } else {
      res.json({
        success: false,
        employee: null,
        message: 'nome nao encontrado'
      });
    }
  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar funcionário no banco de dados'
    });
  }
});

// Rota para buscar múltiplos funcionários por matrícula
app.post('/api/employees/batch', async (req, res) => {
  const { matriculas } = req.body;

  if (!Array.isArray(matriculas) || matriculas.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Matrícula inválida ou vazia'
    });
  }

  try {
    const placeholders = matriculas.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, matricula, empresa, nome, qrcod FROM qrcod_2023 WHERE matricula IN (${placeholders})`,
      matriculas
    );

    // Criar um mapa de matrícula -> {nome, empresa}
    const employeeMap = {};
    rows.forEach(row => {
      employeeMap[row.matricula] = { nome: row.nome, empresa: row.empresa };
    });

    // Para cada matrícula solicitada, retornar nome, empresa ou fallback
    const result = matriculas.map(matricula => {
      const data = employeeMap[matricula];
      return {
        matricula,
        nome: data ? data.nome : 'nome nao encontrado',
        empresa: data ? data.empresa : ''
      };
    });

    res.json({
      success: true,
      employees: result
    });
  } catch (error) {
    console.error('Erro ao buscar funcionários:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar funcionários no banco de dados'
    });
  }
});

// Rota para buscar todos os funcionários (ativos e inativos)
app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, matricula, empresa, nome, qrcod, ativo FROM qrcod_2023 ORDER BY nome ASC'
    );

    res.json({
      success: true,
      employees: rows,
      count: rows.length
    });
  } catch (error) {
    console.error('Erro ao buscar funcionários:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar funcionários no banco de dados'
    });
  }
});

// Rota para criar novo funcionário
app.post('/api/employees', async (req, res) => {
  const { matricula, empresa, nome, qrcod, ativo } = req.body;

  if (!matricula || !nome) {
    return res.status(400).json({
      success: false,
      error: 'Matrícula e nome são obrigatórios'
    });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO qrcod_2023 (matricula, empresa, nome, qrcod, ativo) VALUES (?, ?, ?, ?, ?)',
      [matricula, empresa || '', nome, qrcod || '', ativo !== undefined ? ativo : 1]
    );

    // Buscar o funcionário criado para retornar
    const [rows] = await pool.query(
      'SELECT id, matricula, empresa, nome, qrcod, ativo FROM qrcod_2023 WHERE id = ?',
      [result.insertId]
    );

    res.json({
      success: true,
      employee: rows[0],
      message: 'Funcionário criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar funcionário:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Matrícula já cadastrada'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Erro ao criar funcionário no banco de dados'
    });
  }
});

// Rota para atualizar funcionário
app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const { matricula, empresa, nome, qrcod, ativo } = req.body;

  if (!matricula || !nome) {
    return res.status(400).json({
      success: false,
      error: 'Matrícula e nome são obrigatórios'
    });
  }

  try {
    await pool.query(
      'UPDATE qrcod_2023 SET matricula = ?, empresa = ?, nome = ?, qrcod = ?, ativo = ? WHERE id = ?',
      [matricula, empresa || '', nome, qrcod || '', ativo !== undefined ? ativo : 1, id]
    );

    // Buscar o funcionário atualizado
    const [rows] = await pool.query(
      'SELECT id, matricula, empresa, nome, qrcod, ativo FROM qrcod_2023 WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Funcionário não encontrado'
      });
    }

    res.json({
      success: true,
      employee: rows[0],
      message: 'Funcionário atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar funcionário:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Matrícula já cadastrada'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar funcionário no banco de dados'
    });
  }
});

// Rota para deletar funcionário
app.delete('/api/employees/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'DELETE FROM qrcod_2023 WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Funcionário não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Funcionário deletado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar funcionário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar funcionário no banco de dados'
    });
  }
});

// Rota para atualizar ponto manual
app.put('/api/marcacoes/manual/:id', async (req, res) => {
  const { id } = req.params;
  const { hora, criadoPor } = req.body;

  if (!hora) {
    return res.status(400).json({ success: false, error: 'Hora é obrigatória' });
  }

  try {
    // Buscar dados antigos para o log
    const [oldRows] = await pool.query('SELECT * FROM ponto_manual WHERE id = ?', [id]);
    
    const [result] = await pool.query(
      'UPDATE ponto_manual SET hora = ?, criado_por = ? WHERE id = ?',
      [hora, criadoPor, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Ponto manual não encontrado' });
    }

    if (oldRows.length > 0) {
      await createAuditLog(criadoPor, 'UPDATE', 'ponto_manual', id, oldRows[0], { ...oldRows[0], hora, criado_por: criadoPor });
    }

    res.json({ success: true, message: 'Ponto manual atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar ponto manual:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar ponto manual' });
  }
});

// Rota para deletar ponto manual
app.delete('/api/marcacoes/manual/:id', async (req, res) => {
  const { id } = req.params;
  const { criadoPor } = req.body; // Passado no corpo da requisição DELETE

  try {
    // Buscar dados antigos para o log
    const [oldRows] = await pool.query('SELECT * FROM ponto_manual WHERE id = ?', [id]);

    const [result] = await pool.query(
      'DELETE FROM ponto_manual WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Ponto manual não encontrado' });
    }

    if (oldRows.length > 0) {
      await createAuditLog(criadoPor || 'Desconhecido', 'DELETE', 'ponto_manual', id, oldRows[0], null);
    }

    res.json({ success: true, message: 'Ponto manual deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar ponto manual:', error);
    res.status(500).json({ success: false, error: 'Erro ao deletar ponto manual' });
  }
});

// Rota para buscar todos os funcionários ativos (ativo=1)
app.get('/api/employees/active', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, matricula, empresa, nome, qrcod, ativo FROM qrcod_2023 WHERE ativo = 1'
    );

    res.json({
      success: true,
      employees: rows,
      count: rows.length
    });
  } catch (error) {
    console.error('Erro ao buscar funcionários ativos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar funcionários ativos no banco de dados'
    });
  }
});

// Rota para desativar funcionários em lote
app.post('/api/employees/batch-deactivate', async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'IDs inválidos' });
  }

  try {
    const placeholders = ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE qrcod_2023 SET ativo = 0 WHERE id IN (${placeholders})`,
      ids
    );

    res.json({ success: true, message: 'Funcionários desativados com sucesso' });
  } catch (error) {
    console.error('Erro ao desativar funcionários em lote:', error);
    res.status(500).json({ success: false, error: 'Erro ao desativar funcionários no banco de dados' });
  }
});

// Rota de Login (Autenticação pelo Banco de Dados)
app.post('/api/auth/login', async (req, res) => {
  const { accessCode } = req.body;

  if (!accessCode) {
    return res.status(400).json({ success: false, error: 'Código de acesso é obrigatório' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT codigo_acesso, nome_usuario, ativo FROM login_apontamento WHERE codigo_acesso = ? AND ativo = 1',
      [accessCode]
    );

    if (rows.length > 0) {
      res.json({
        success: true,
        user: {
          userName: rows[0].nome_usuario,
          accessCode: rows[0].codigo_acesso
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Código de acesso inválido ou usuário inativo'
      });
    }
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao processar login'
    });
  }
});

// Rota para buscar todos os usuários administradores
app.get('/api/auth/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT nome_usuario FROM login_apontamento WHERE ativo = 1 ORDER BY nome_usuario ASC');
    res.json({ success: true, users: rows.map(r => r.nome_usuario) });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar usuários' });
  }
});

// --- Rota de Auditoria ---
app.get('/api/audit-logs', async (req, res) => {
  const { dataInicio, dataFim, usuario, acao } = req.query;
  
  try {
    let query = `
      SELECT id, usuario, acao, tabela, registro_id, dados_antigos, dados_novos, 
             DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as timestamp 
      FROM audit_log 
      WHERE 1=1
    `;
    const params = [];

    if (dataInicio) {
      query += " AND timestamp >= ?";
      params.push(`${dataInicio} 00:00:00`);
    }
    if (dataFim) {
      query += " AND timestamp <= ?";
      params.push(`${dataFim} 23:59:59`);
    }
    if (usuario) {
      const userList = Array.isArray(usuario) ? usuario : [usuario];
      if (userList.length > 0) {
        const placeholders = userList.map(() => '?').join(',');
        query += ` AND usuario IN (${placeholders})`;
        params.push(...userList);
      }
    }
    if (acao) {
      query += " AND acao = ?";
      params.push(acao);
    }

    query += " ORDER BY timestamp DESC LIMIT 500";

    const [rows] = await pool.query(query, params);
    res.json({ success: true, logs: rows });
  } catch (error) {
    console.error('Erro ao buscar logs de auditoria:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar logs de auditoria' });
  }
});

// --- Rotas de Eventos (Status Fixos) ---

// Rota para salvar um novo evento (afastamento, férias, etc)
app.post('/api/employees/events', async (req, res) => {
  const { matricula, dataInicio, dataFim, tipoEvento, criadoPor, categoria } = req.body;

  if (!matricula || !dataInicio || !dataFim || !tipoEvento) {
    return res.status(400).json({ success: false, error: 'Matrícula, data início/fim e tipo de evento são obrigatórios' });
  }

  try {
    const [result] = await pool.query(`
      INSERT INTO evento_funcionario (matricula_funcionario, data_inicio, data_fim, tipo_evento, criado_por, categoria)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [matricula, dataInicio, dataFim, tipoEvento, criadoPor, categoria || 'PERIODO']);

    await createAuditLog(criadoPor, 'CREATE', 'evento_funcionario', result.insertId, null, { matricula, dataInicio, dataFim, tipoEvento, categoria });

    res.json({ success: true, message: 'Evento salvo com sucesso' });
  } catch (error) {
    console.error('Erro ao salvar evento:', error);
    res.status(500).json({ success: false, error: 'Erro ao salvar evento' });
  }
});

// Rota para buscar todos os eventos (para a aba Eventos)
app.get('/api/employees/events/all', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        e.id, 
        e.matricula_funcionario, 
        f.nome as nome_funcionario,
        DATE_FORMAT(e.data_inicio, '%Y-%m-%d') as data_inicio, 
        DATE_FORMAT(e.data_fim, '%Y-%m-%d') as data_fim, 
        e.tipo_evento, 
        e.categoria,
        e.criado_por, 
        DATE_FORMAT(e.criado_em, '%Y-%m-%d %H:%i:%s') as criado_em
      FROM evento_funcionario e
      LEFT JOIN qrcod_2023 f ON e.matricula_funcionario = f.matricula
      WHERE e.categoria = 'PERIODO'
      ORDER BY e.criado_em DESC
    `);
    res.json({ success: true, events: rows });
  } catch (error) {
    console.error('Erro ao buscar todos os eventos:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar eventos' });
  }
});

// Rota para atualizar um evento
app.put('/api/employees/events/:id', async (req, res) => {
  const { id } = req.params;
  const { dataInicio, dataFim, tipoEvento, criadoPor } = req.body;

  try {
    const [oldRows] = await pool.query('SELECT * FROM evento_funcionario WHERE id = ?', [id]);
    
    await pool.query(`
      UPDATE evento_funcionario 
      SET data_inicio = ?, data_fim = ?, tipo_evento = ?
      WHERE id = ?
    `, [dataInicio, dataFim, tipoEvento, id]);

    if (oldRows.length > 0) {
      await createAuditLog(criadoPor, 'UPDATE', 'evento_funcionario', id, oldRows[0], { dataInicio, dataFim, tipoEvento });
    }

    res.json({ success: true, message: 'Evento atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar evento:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar evento' });
  }
});

// Rota para deletar evento
app.delete('/api/employees/events/:id', async (req, res) => {
  const { id } = req.params;
  const { criadoPor } = req.body;

  try {
    const [oldRows] = await pool.query('SELECT * FROM evento_funcionario WHERE id = ?', [id]);
    
    const [result] = await pool.query(
      'DELETE FROM evento_funcionario WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Evento não encontrado' });
    }

    if (oldRows.length > 0) {
      await createAuditLog(criadoPor || 'Desconhecido', 'DELETE', 'evento_funcionario', id, oldRows[0], null);
    }

    res.json({ success: true, message: 'Evento deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar evento:', error);
    res.status(500).json({ success: false, error: 'Erro ao deletar evento' });
  }
});

// Rota para buscar eventos em lote
app.post('/api/employees/events/batch', async (req, res) => {
  const { matriculas, dataInicio, dataFim } = req.body;

  if (!Array.isArray(matriculas) || matriculas.length === 0 || !dataInicio || !dataFim) {
    return res.status(400).json({ success: false, error: 'Parâmetros inválidos' });
  }

  try {
    const placeholders = matriculas.map(() => '?').join(',');
    const [rows] = await pool.query(`
      SELECT 
        matricula_funcionario, 
        DATE_FORMAT(data_inicio, '%Y-%m-%d') as data_inicio, 
        DATE_FORMAT(data_fim, '%Y-%m-%d') as data_fim, 
        tipo_evento, 
        categoria,
        criado_por, 
        criado_em
      FROM evento_funcionario
      WHERE matricula_funcionario IN (${placeholders})
      AND (
        (data_inicio BETWEEN ? AND ?) OR
        (data_fim BETWEEN ? AND ?) OR
        (? BETWEEN data_inicio AND data_fim)
      )
    `, [...matriculas, dataInicio, dataFim, dataInicio, dataFim, dataInicio]);
    res.json({ success: true, events: rows });
  } catch (error) {
    console.error('Erro ao buscar eventos:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar eventos' });
  }
});

// --- Rotas de Marcações Desconsideradas ---

// Rota para alternar status de "desconsiderar" de um ponto
app.post('/api/marcacoes/desconsiderar', async (req, res) => {
  const { matricula, data, marcacaoId, nsr, relogioNs, criadoPor, desconsiderar } = req.body;

  if (!matricula || !data || (marcacaoId === undefined && nsr === undefined)) {
    return res.status(400).json({ success: false, error: 'Parâmetros insuficientes' });
  }

  try {
    if (desconsiderar) {
      // Inserir na tabela de desconsiderados
      await pool.query(`
        INSERT IGNORE INTO marcacao_desconsiderada 
        (matricula_funcionario, data, marcacao_id, nsr, relogio_ns, criado_por)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [matricula, data, marcacaoId || null, nsr || null, relogioNs || null, criadoPor]);

      await createAuditLog(criadoPor, 'IGNORE_POINT', 'marcacao_desconsiderada', null, null, { matricula, data, marcacaoId, nsr, relogioNs });
    } else {
      // Remover da tabela de desconsiderados
      await pool.query(`
        DELETE FROM marcacao_desconsiderada 
        WHERE matricula_funcionario = ? AND data = ? 
        AND (marcacao_id = ? OR (nsr = ? AND relogio_ns = ?))
      `, [matricula, data, marcacaoId || null, nsr || null, relogioNs || null]);

      await createAuditLog(criadoPor, 'UNIGNORE_POINT', 'marcacao_desconsiderada', null, { matricula, data, marcacaoId, nsr, relogioNs }, null);
    }

    res.json({ success: true, message: 'Status de desconsideração atualizado' });
  } catch (error) {
    console.error('Erro ao atualizar status de desconsideração:', error);
    res.status(500).json({ success: false, error: 'Erro ao processar solicitação' });
  }
});

// Rota para buscar marcações desconsideradas em lote
app.post('/api/marcacoes/desconsiderar/batch', async (req, res) => {
  const { matriculas, dataInicio, dataFim } = req.body;

  if (!Array.isArray(matriculas) || matriculas.length === 0 || !dataInicio || !dataFim) {
    return res.status(400).json({ success: false, error: 'Parâmetros inválidos' });
  }

  try {
    const placeholders = matriculas.map(() => '?').join(',');
    const [rows] = await pool.query(`
      SELECT 
        matricula_funcionario, 
        DATE_FORMAT(data, '%Y-%m-%d') as data, 
        marcacao_id, 
        nsr, 
        relogio_ns
      FROM marcacao_desconsiderada
      WHERE matricula_funcionario IN (${placeholders})
      AND data BETWEEN ? AND ?
    `, [...matriculas, dataInicio, dataFim]);
    res.json({ success: true, ignoredPoints: rows });
  } catch (error) {
    console.error('Erro ao buscar marcações desconsideradas:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar marcações desconsideradas' });
  }
});

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API funcionando corretamente' });
});

// Inicializar servidor
async function startServer() {
  await initializeDatabase();
  
  // Servir arquivos estáticos do Angular (Production Build)
  const distPath = path.join(__dirname, '../dist/controleApontamento/browser');
  app.use(express.static(distPath));

  // Rota catch-all para Single Page Application (Angular)
  app.get('*', (req, res) => {
    // Se não for uma rota de API, serve o index.html
    if (!req.url.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na rede local na porta ${PORT}`);
    console.log(`Acesse através de: http://localhost:${PORT}`);
    console.log(`Ou pelo IP da sua máquina: http://[SEU-IP]:${PORT}`);
  });
}

startServer();
