const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end("Not Found"); }
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
        else if (filePath.endsWith('.html')) res.setHeader('Content-Type', 'text/html');
        res.writeHead(200);
        res.end(data);
    });
}).listen(3000);
console.log('Server running at http://localhost:3000/');
