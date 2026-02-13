const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value : '';
}

function cleanGeneratedCode(value) {
  return value.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function createAirtableRecord({ prompt, createdAt }) {
  const apiKey = getEnv('AIRTABLE_API_KEY');
  const baseId = getEnv('AIRTABLE_BASE_ID');
  const tableName = getEnv('AIRTABLE_TABLE_NAME') || 'Prompts';

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
    throw new Error(`Airtable create failed: ${await response.text()}`);
  }

  return response.json();
}

async function updateAirtableResponse({ recordId, respuestaIA }) {
  const apiKey = getEnv('AIRTABLE_API_KEY');
  const baseId = getEnv('AIRTABLE_BASE_ID');
  const tableName = getEnv('AIRTABLE_TABLE_NAME') || 'Prompts';

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
    throw new Error(`Airtable update failed: ${await response.text()}`);
  }

  return response.json();
}

async function generateWithGemini(prompt) {
  const apiKey = getEnv('IA_API_KEY');
  const model = getEnv('GEMINI_MODEL') || 'gemini-1.5-flash';
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
              text: `${prompt}\n\nDevuelve solo un documento HTML completo (incluye CSS y JS cuando aplique). No uses markdown.`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`AI provider failed: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || typeof text !== 'string') {
    throw new Error('AI did not return code.');
  }

  return cleanGeneratedCode(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requiredVars = [
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID',
    'AIRTABLE_TABLE_NAME',
    'IA_API_KEY'
  ];

  const missing = requiredVars.filter((name) => !getEnv(name));
  if (missing.length) {
    return res
      .status(500)
      .json({ error: `Missing env vars: ${missing.join(', ')}` });
  }

  const prompt = req.body?.prompt;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const createdAt = new Date().toISOString();
    const record = await createAirtableRecord({ prompt, createdAt });
    const code = await generateWithGemini(prompt);
    await updateAirtableResponse({ recordId: record.id, respuestaIA: code });

    return res.status(200).json({ code });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unexpected error' });
  }
}
