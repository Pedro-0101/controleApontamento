const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: '192.168.200.136',
  port: 3306,
  database: 'dnpmix',
  user: 'root',
  password: 'pass'
};

/**
 * Converte data de DD/MM/YYYY para YYYY-MM-DD
 * @param {string} dateStr 
 * @returns {string|null}
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  // Formato DD/MM/YYYY
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const d = parseInt(dm[1], 10);
    const m = parseInt(dm[2], 10);
    const y = parseInt(dm[3], 10);
    if (y < 1900 || y > 2100) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Formato YYYY-MM-DD
  const ym = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ym) {
    const y = parseInt(ym[1], 10);
    const m = parseInt(ym[2], 10);
    const d = parseInt(ym[3], 10);
    if (y < 1900 || y > 2100) return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Adiciona 90 dias a uma data
 * @param {string} dateStr (YYYY-MM-DD)
 * @returns {string|null} (YYYY-MM-DD)
 */
function calculateExpDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  } catch (e) {
    return null;
  }
}

async function run() {
  const csvPath = path.join(__dirname, '../Funcionarios DNP 1.CSV');
  
  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo CSV não encontrado em:', csvPath);
    return;
  }
  
  const csvData = fs.readFileSync(csvPath, 'utf8');
  const lines = csvData.split(/\r?\n/);
  
  if (lines.length < 2) {
    console.error('Arquivo CSV vazio ou sem dados.');
    return;
  }

  // Detectar delimitador (Semicolon detectado na inspeção)
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  console.log(`Usando delimitador: "${delimiter}"`);

  const header = firstLine.split(delimiter);
  const idxMatricula = header.findIndex(h => h.toLowerCase().includes('matricula'));
  const idxAdmissao = header.findIndex(h => h.toLowerCase().includes('admissao') || h.toLowerCase().includes('admissão'));

  if (idxMatricula === -1 || idxAdmissao === -1) {
    console.error('Cabeçalho inválido. Colunas não encontradas.');
    console.log('Cabeçalho encontrado:', header);
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Conectado ao banco de dados.');

    let successCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(delimiter);
      const matricula = parts[idxMatricula]?.trim().replace(/['"]/g, '').replace(/^\uFEFF/, '');
      const dataAdmissaoRaw = parts[idxAdmissao]?.trim();

      if (!matricula || !dataAdmissaoRaw) continue;

      const dataAdmissao = parseDate(dataAdmissaoRaw);
      if (!dataAdmissao) {
        console.warn(`[Linha ${i + 1}] Data de admissão inválida: ${dataAdmissaoRaw}`);
        errorCount++;
        continue;
      }

      const dataFimExperiencia = calculateExpDate(dataAdmissao);
      if (!dataFimExperiencia) {
        console.warn(`[Linha ${i + 1}] Erro ao calcular experiência para: ${dataAdmissao}`);
        errorCount++;
        continue;
      }

      try {
        const [result] = await connection.query(
          'UPDATE qrcod_2023 SET data_admissao = ?, data_fim_experiencia = ? WHERE matricula = ?',
          [dataAdmissao, dataFimExperiencia, matricula]
        );

        if (result.affectedRows > 0) {
          successCount++;
        } else {
          notFoundCount++;
          // console.warn(`[AVISO] Matrícula ${matricula} não encontrada.`);
        }
      } catch (err) {
        console.error(`[ERRO] Matrícula ${matricula}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n--- Resumo da Operação ---');
    console.log(`Total de linhas processadas: ${lines.length - 1}`);
    console.log(`Sucesso (atualizados): ${successCount}`);
    console.log(`Não encontrados no banco: ${notFoundCount}`);
    console.log(`Erros de dados: ${errorCount}`);

  } catch (error) {
    console.error('Erro fatal:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Conexão encerrada.');
    }
  }
}

run();
