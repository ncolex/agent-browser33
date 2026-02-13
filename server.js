import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function createAirtableRecord({ prompt, createdAt }) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Prompts';

  const response = await fetch(
    `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableName)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          Prompt: prompt,
          CreatedAt: createdAt
        }
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error creando registro en Airtable: ${text}`);
  }

  return response.json();
}

async function updateAirtableResponse({ recordId, respuestaIA }) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'Prompts';

  const response = await fetch(
    `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          RespuestaIA: respuestaIA
        }
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error actualizando respuesta en Airtable: ${text}`);
  }

  return response.json();
}

async function generateWithGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${prompt}\n\nResponde solo con HTML completo ejecutable (incluyendo CSS y JS), sin markdown ni explicaciones.`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error del proveedor IA: ${text}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error('La IA no devolvió contenido de código válido.');
  }

  return text;
}

app.post('/generate', async (req, res) => {
  const { prompt } = req.body ?? {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'El campo prompt es obligatorio.' });
  }

  const requiredVars = [
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID',
    'AIRTABLE_TABLE_NAME',
    'GEMINI_API_KEY'
  ];

  const missing = requiredVars.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return res
      .status(500)
      .json({ error: `Faltan variables de entorno: ${missing.join(', ')}` });
  }

  try {
    const createdAt = new Date().toISOString();
    const createdRecord = await createAirtableRecord({ prompt, createdAt });
    const recordId = createdRecord.id;

    const code = await generateWithGemini(prompt);

    await updateAirtableResponse({
      recordId,
      respuestaIA: code
    });

    return res.json({ code, recordId, createdAt });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor activo en http://localhost:${port}`);
});
