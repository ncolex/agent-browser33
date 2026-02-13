import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import generateHandler from './api/generate.js';

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/generate', (req, res) => generateHandler(req, res));

app.listen(port, () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});
