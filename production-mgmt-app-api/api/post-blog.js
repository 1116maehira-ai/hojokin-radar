// POST /api/post-blog
// Body: { title, body }
// body may contain lines like:
//   📷 https://... (image URL → becomes Wix IMAGE node)
//   Regular text lines → PARAGRAPH nodes
// Returns: { postId, postUrl }

const WIX_API_BASE = 'https://www.wixapis.com/blog/v3';
const MEMBER_ID = 'cd3b859b-c399-491a-8bb4-9eb1d760374a';

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function createParagraphNode(text) {
  return {
    type: 'PARAGRAPH',
    id: generateId(),
    nodes: [
      {
        type: 'TEXT',
        id: generateId(),
        nodes: [],
        textData: {
          text,
          decorations: [],
        },
      },
    ],
    paragraphData: {
      textStyle: { textAlignment: 'AUTO' },
      indentation: 0,
    },
  };
}

function createHeadingNode(text, level = 2) {
  return {
    type: 'HEADING',
    id: generateId(),
    nodes: [
      {
        type: 'TEXT',
        id: generateId(),
        nodes: [],
        textData: {
          text,
          decorations: [],
        },
      },
    ],
    headingData: {
      level,
      textStyle: { textAlignment: 'AUTO' },
      indentation: 0,
    },
  };
}

function createImageNode(imageUrl, altText = '') {
  // imageUrl can be:
  //   - External URL: https://...
  //   - Wix Media ID: wix:image://v1/...
  //   - Static Wix URL: https://static.wixstatic.com/...
  const isWixMedia = imageUrl.startsWith('wix:image://');
  const isStaticWix = imageUrl.includes('static.wixstatic.com');

  const src = isWixMedia
    ? { id: imageUrl }
    : { url: imageUrl, width: 1024, height: 1024 };

  return {
    type: 'IMAGE',
    id: generateId(),
    nodes: [],
    imageData: {
      containerData: {
        width: { size: 'CONTENT' },
        alignment: 'CENTER',
        textWrap: false,
      },
      image: {
        src,
        width: 1024,
        height: 1024,
        altText: altText || 'Article image',
      },
      link: {},
    },
  };
}

function bodyToNodes(body) {
  const lines = body.split('\n');
  const nodes = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Image line: 📷 https://...
    if (trimmed.startsWith('📷')) {
      const urlMatch = trimmed.match(/📷\s*(https?:\/\/\S+|wix:image:\/\/\S+)/);
      if (urlMatch) {
        nodes.push(createImageNode(urlMatch[1]));
      }
      continue;
    }

    // Video line (skip for now — Wix video embed requires video ID)
    if (trimmed.startsWith('🎬')) continue;

    // Heading: lines starting with ## or # or ▶
    if (trimmed.startsWith('## ')) {
      nodes.push(createHeadingNode(trimmed.slice(3), 2));
      continue;
    }
    if (trimmed.startsWith('# ')) {
      nodes.push(createHeadingNode(trimmed.slice(2), 1));
      continue;
    }
    if (trimmed.startsWith('▶ ') || trimmed.startsWith('■ ')) {
      nodes.push(createHeadingNode(trimmed.slice(2), 3));
      continue;
    }

    // Regular paragraph
    nodes.push(createParagraphNode(trimmed));
  }

  return nodes;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, body } = req.body;

  const WIX_API_KEY = process.env.WIX_API_KEY;
  const WIX_SITE_ID = process.env.WIX_SITE_ID;

  if (!WIX_API_KEY || !WIX_SITE_ID) {
    return res.status(500).json({ error: 'WIX_API_KEY or WIX_SITE_ID not set' });
  }

  const nodes = bodyToNodes(body);

  const draftPayload = {
    draftPost: {
      title,
      richContent: { nodes },
      memberId: MEMBER_ID,
    },
  };

  // Create draft
  const draftResponse = await fetch(`${WIX_API_BASE}/draft-posts`, {
    method: 'POST',
    headers: {
      Authorization: WIX_API_KEY,
      'wix-site-id': WIX_SITE_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(draftPayload),
  });

  if (!draftResponse.ok) {
    const err = await draftResponse.json();
    return res.status(500).json({ error: `Wix draft error: ${JSON.stringify(err)}` });
  }

  const draftData = await draftResponse.json();
  const postId = draftData.draftPost?.id;

  if (!postId) {
    return res.status(500).json({ error: 'No postId returned from Wix' });
  }

  // Publish the draft
  const publishResponse = await fetch(`${WIX_API_BASE}/draft-posts/${postId}/publish`, {
    method: 'POST',
    headers: {
      Authorization: WIX_API_KEY,
      'wix-site-id': WIX_SITE_ID,
      'Content-Type': 'application/json',
    },
  });

  if (!publishResponse.ok) {
    const err = await publishResponse.json();
    return res.status(500).json({ error: `Wix publish error: ${JSON.stringify(err)}`, postId });
  }

  const publishData = await publishResponse.json();
  const postUrl = publishData.post?.url || publishData.draftPost?.url || null;

  return res.status(200).json({ postId, postUrl });
}
