const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

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
app.use(express.json());

// Pool de conexões
let pool;

async function initializeDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    
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

    console.log('Pool de conexões MySQL criado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
    process.exit(1);
  }
}

// Rota para salvar um novo comentário
app.post('/api/comments', async (req, res) => {
  const { matricula, data, comentario, criadoPor } = req.body;

  if (!matricula || !data || !comentario) {
    return res.status(400).json({ success: false, error: 'Matrícula, data e comentário são obrigatórios' });
  }

  try {
    await pool.query(`
      INSERT INTO comentario_dia (matricula_funcionario, data, comentario, criado_por)
      VALUES (?, ?, ?, ?)
    `, [matricula, data, comentario, criadoPor]);

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
    await pool.query(`
      INSERT INTO ponto_manual (matricula_funcionario, data, hora, criado_por)
      VALUES (?, ?, ?, ?)
    `, [matricula, data, hora, criadoPor]);

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
      SELECT matricula_funcionario, DATE_FORMAT(data, '%Y-%m-%d') as data, TIME_FORMAT(hora, '%H:%i') as hora, criado_por, criado_em
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
    
    // Buscar marcações dos últimos 7 dias
    const [marcacoes] = await pool.query(
      `SELECT * FROM marcacoes 
       WHERE MatriculaFuncionario = ? 
       AND DATE(DataMarcacao) BETWEEN ? AND ?
       ORDER BY DataMarcacao ASC`,
      [matricula, dataInicio, dataFim]
    );
    
    // Buscar pontos manuais dos últimos 7 dias
    const [pontosManuais] = await pool.query(
      `SELECT DATE_FORMAT(data, '%Y-%m-%d') as data, TIME_FORMAT(hora, '%H:%i') as hora, criado_por, criado_em
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
    
    res.json({
      success: true,
      history: {
        marcacoes,
        pontosManuais,
        comentarios
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

    // Criar um mapa de matrícula -> nome
    const employeeMap = {};
    rows.forEach(row => {
      employeeMap[row.matricula] = row.nome;
    });

    // Para cada matrícula solicitada, retornar nome ou "nome nao encontrado"
    const result = matriculas.map(matricula => ({
      matricula,
      nome: employeeMap[matricula] || 'nome nao encontrado'
    }));

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

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API funcionando corretamente' });
});

// Inicializar servidor
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer();
