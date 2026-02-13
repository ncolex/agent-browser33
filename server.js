import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.post('/generate', async (req, res) => {
  const { instruction } = req.body ?? {};

  if (!instruction || typeof instruction !== 'string') {
    return res.status(400).json({ error: 'La instrucción es obligatoria.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  if (!apiKey) {
    return res
      .status(500)
      .json({ error: 'Falta configurar OPENAI_API_KEY en el entorno.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'Respondé únicamente con HTML completo ejecutable (incluyendo CSS y JS dentro del mismo documento). No agregues explicaciones ni markdown.'
          },
          {
            role: 'user',
            content: instruction
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(502).json({ error: `Error del proveedor IA: ${errorText}` });
    }

    const data = await response.json();
    const code = data.output_text?.trim();

    if (!code) {
      return res
        .status(502)
        .json({ error: 'La IA no devolvió código en un formato válido.' });
    }

    return res.json({ code });
  } catch (error) {
    return res.status(500).json({ error: `Error interno: ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});
