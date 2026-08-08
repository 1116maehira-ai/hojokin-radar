// POST /api/upload-wix-media
// Body: { imageUrl, filename?: string }
// Returns: { wixImageId, wixImageUrl }
//
// Imports an external image URL into Wix Media Manager so it can be
// embedded in Wix Blog richContent IMAGE nodes.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { imageUrl, filename = 'article-image.png' } = req.body;

  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

  const WIX_API_KEY = process.env.WIX_API_KEY;
  const WIX_SITE_ID = process.env.WIX_SITE_ID;

  if (!WIX_API_KEY || !WIX_SITE_ID) {
    return res.status(500).json({ error: 'WIX_API_KEY or WIX_SITE_ID not set' });
  }

  // Step 1: If image is base64, upload as binary; if URL, import by URL
  if (imageUrl.startsWith('data:image/')) {
    const base64Data = imageUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const mimeType = imageUrl.split(';')[0].split(':')[1];

    // Get upload URL from Wix
    const uploadUrlResponse = await fetch('https://www.wixapis.com/site-media/v1/files/upload/url', {
      method: 'POST',
      headers: {
        Authorization: WIX_API_KEY,
        'wix-site-id': WIX_SITE_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mimeType,
        fileName: filename,
        sizeInBytes: buffer.byteLength,
      }),
    });

    if (!uploadUrlResponse.ok) {
      const err = await uploadUrlResponse.json();
      return res.status(500).json({ error: `Wix upload URL error: ${JSON.stringify(err)}` });
    }

    const { uploadUrl, uploadToken } = await uploadUrlResponse.json();

    // Upload binary to the signed URL
    const uploadResponse = await fetch(`${uploadUrl}&uploadToken=${uploadToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      return res.status(500).json({ error: 'Failed to upload binary to Wix' });
    }

    const uploadResult = await uploadResponse.json();
    const file = uploadResult.file || uploadResult;

    return res.status(200).json({
      wixImageId: file.id,
      wixImageUrl: file.url,
    });
  }

  // Step 2: Import external URL into Wix Media Manager
  const importResponse = await fetch('https://www.wixapis.com/site-media/v1/files/import', {
    method: 'POST',
    headers: {
      Authorization: WIX_API_KEY,
      'wix-site-id': WIX_SITE_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: imageUrl,
      mimeType: 'image/png',
      displayName: filename,
    }),
  });

  if (!importResponse.ok) {
    const err = await importResponse.json();
    return res.status(500).json({ error: `Wix import error: ${JSON.stringify(err)}` });
  }

  const importData = await importResponse.json();
  const file = importData.file || importData;

  // Poll for import completion (max 10 seconds)
  if (file.state === 'PENDING' || file.state === 'IN_PROGRESS') {
    const fileId = file.id;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const statusResponse = await fetch(`https://www.wixapis.com/site-media/v1/files/${fileId}`, {
        headers: {
          Authorization: WIX_API_KEY,
          'wix-site-id': WIX_SITE_ID,
        },
      });
      const statusData = await statusResponse.json();
      const f = statusData.file || statusData;
      if (f.state === 'READY') {
        return res.status(200).json({ wixImageId: f.id, wixImageUrl: f.url });
      }
    }
    // Return pending — caller can retry
    return res.status(202).json({ wixImageId: fileId, wixImageUrl: null, status: 'PENDING' });
  }

  return res.status(200).json({
    wixImageId: file.id,
    wixImageUrl: file.url,
  });
}
