const mysql = require('mysql2/promise');

const dbConfig = {
  host: '192.168.200.136',
  port: 3306,
  database: 'dnpmix',
  user: 'root',
  password: 'pass'
};

async function main() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Successfully connected to DB');
    
    const [countRows] = await connection.query('SELECT COUNT(*) as cnt FROM qrcod_2023');
    console.log('Total employees:', countRows[0].cnt);
    
    const [activeRows] = await connection.query('SELECT COUNT(*) as cnt FROM qrcod_2023 WHERE ativo = 1');
    console.log('Active employees:', activeRows[0].cnt);
    
    const [sample] = await connection.query('SELECT matricula, nome, ativo, empresa, local FROM qrcod_2023 LIMIT 5');
    console.log('Sample employees:', JSON.stringify(sample, null, 2));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (connection) await connection.end();
  }
}

main();
