const http = require('http');
const fs = require('fs');

// Key-value pair where key is a URL and value is a file path
const urlMap = {
    'http://localhost:9990/w/id-b409f9a3c553/20240426184919mp_/https://a0.muscache.com/airbnb/static/packages/web/common/f4c9f.a8028461f8.js': '/vault-swift/jingyz/chrome_overrides/f4c9f.a8028461f8.js',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/') {
    let responseObj = {};
    for (let url in urlMap) {
      try {
        let data = fs.readFileSync(urlMap[url], 'utf8');
        responseObj[url] = data;
      } catch (err) {
        console.error(err);
      }
    }
    res.end(JSON.stringify(responseObj));
  }
});

server.listen(3000, 'localhost', () => {
  console.log('Server is running on http://localhost:3000');
});