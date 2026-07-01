const http = require('http');

http.get('http://localhost:3001/api/employees/active', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Success:', json.success);
      console.log('Count:', json.count);
      if (json.employees) {
        console.log('Sample:', json.employees.slice(0, 2));
      }
    } catch (e) {
      console.log('Error parsing JSON:', e);
      console.log('Raw data:', data);
    }
  });
}).on('error', err => {
  console.error('Error fetching endpoint:', err);
});
