// POST /api/generate-image
// Body: { prompt, withCharacter: true/false, articleTheme: string }
// Returns: { imageUrl }
//
// 脳手郎 reference images must be stored in Supabase Storage as public URLs.
// Set env var: NOTERO_REF_IMAGE_URLS=url1,url2,url3,url4

let cachedCharacterDescription = null;

async function getCharacterDescription() {
  if (cachedCharacterDescription) return cachedCharacterDescription;

  const refUrls = process.env.NOTERO_REF_IMAGE_URLS
    ? process.env.NOTERO_REF_IMAGE_URLS.split(',').map(u => u.trim()).filter(Boolean)
    : [];

  if (!refUrls.length) {
    throw new Error('NOTERO_REF_IMAGE_URLS is not set. Upload 脳手郎 reference images to Supabase Storage and set the env var.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are helping generate consistent character illustrations.
Analyze these reference images of the mascot character "脳手郎" (Notero) and write a detailed visual description for use in image generation prompts.
Include: exact body shape, proportions, colors of each body part, distinctive features, style/art style.
Write in English. Be extremely specific — this description will be injected into DALL-E prompts to keep the character consistent.`,
            },
            ...refUrls.slice(0, 4).map(url => ({
              type: 'image_url',
              image_url: { url, detail: 'high' },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`GPT-4o vision error: ${err.error?.message}`);
  }

  const data = await response.json();
  cachedCharacterDescription = data.choices?.[0]?.message?.content || '';
  return cachedCharacterDescription;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, withCharacter = true } = req.body;

  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

  let fullPrompt = prompt;

  if (withCharacter) {
    const characterDesc = await getCharacterDescription();
    fullPrompt = `${prompt}

The mascot character "脳手郎" (Notero) must appear prominently in this scene. Character reference: ${characterDesc}

Style: clean digital illustration, professional business context, friendly and approachable tone.`;
  } else {
    fullPrompt = `${prompt}

Style: clean digital illustration, professional business context, no specific character required.`;
  }

  const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    }),
  });

  const imageData = await imageResponse.json();

  if (!imageResponse.ok) {
    return res.status(500).json({ error: imageData.error?.message || 'Image generation failed' });
  }

  const result = imageData.data?.[0];
  const imageUrl = result?.url
    || (result?.b64_json ? `data:image/png;base64,${result.b64_json}` : null);

  if (!imageUrl) {
    return res.status(500).json({ error: 'No image returned from OpenAI' });
  }

  return res.status(200).json({ imageUrl });
}
