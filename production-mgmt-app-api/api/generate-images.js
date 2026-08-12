// POST /api/generate-images
// Flow:
//   1. Read 脳手郎 PNG reference photos from public/noutero-refs/ (committed to repo)
//   2. GPT-4o-mini reads the article and designs 3 unique scenes (top/middle/bottom)
//   3. gpt-image-1 /images/edits receives the actual PNG + scene description
//   4. Upload generated images to Supabase Storage

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://vfgujkocemgezvcuixpp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmZ3Vqa29jZW1nZXp2Y3VpeHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjA4MTEsImV4cCI6MjA5MDEzNjgxMX0.-IxXJw7St2pLKSXKDU3dunJdgIkL-bhobD53SS-ci1s';

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// 脳手郎 reference PNG photos — stored in public/noutero-refs/ (committed to repo)
// Source: https://drive.google.com/drive/folders/1Cke0UMLU7ImPTlEj4sfnHwX81WlTJrnp
const NOUTERO_REF_FILES = ['noutero-1.png', 'noutero-2.png', 'noutero-3.png', 'noutero-4.png'];

// Read 脳手郎 PNG reference images from the filesystem (public/noutero-refs/)
function loadNouteroRefs(step) {
  const refs = [];
  const refsDir = join(process.cwd(), 'public', 'noutero-refs');
  for (const filename of NOUTERO_REF_FILES) {
    try {
      const buf = readFileSync(join(refsDir, filename));
      refs.push(buf);
      step(`  ✅ 参考PNG読込: ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
      if (refs.length >= 2) break; // 2枚あれば十分
    } catch (e) {
      step(`  ⚠️ ファイル読込失敗: ${filename} — ${e.message}`);
    }
  }
  return refs;
}

// GPT-4o-mini が記事を読んで上・中・下 3つのシーンを設計する
async function designScenes(variation) {
  const title = variation.blog_title || variation.summary || '';
  const body = (variation.blog_body || variation.body_mail || '').slice(0, 600);

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a creative director for a Japanese business newsletter. The mascot is 脳手郎 (Noutero): a gold metallic humanoid 3D collectible figurine with a pink brain sitting on top of its head, a blue beak, and large round eyes.

Design 3 specific, vivid image scenes in English for images placed at the top, middle, and bottom of a blog article. Each scene MUST:
- Feature 脳手郎 as the main visible subject
- Visually match the article's specific theme and emotion
- Be concrete and visual (not abstract)

Reply ONLY in JSON: {"top": "...", "middle": "...", "bottom": "..."}`,
        },
        {
          role: 'user',
          content: `Article title: ${title}\n\nContent: ${body}`,
        },
      ],
    }),
  });

  const d = await r.json();
  if (!r.ok) throw new Error(`Scene design failed (${r.status}): ${d.error?.message}`);

  try {
    const scenes = JSON.parse(d.choices[0].message.content);
    if (!scenes.top || !scenes.middle || !scenes.bottom) throw new Error('incomplete');
    return scenes;
  } catch {
    // フォールバック: タイトルベースの汎用シーン
    return {
      top: `脳手郎 stands in a bold hero pose looking directly at the viewer, representing: ${title.slice(0, 60)}`,
      middle: `脳手郎 actively explains and presents documents or a screen showing concepts from: ${title.slice(0, 60)}`,
      bottom: `脳手郎 raises both arms in triumph and celebration, encouraging the reader to take action on: ${title.slice(0, 60)}`,
    };
  }
}

// PNG参考画像 + シーン説明 → gpt-image-1 /images/edits で画像生成
async function generateArticleImage(refBuffer, sceneDesc) {
  const prompt = `This is a reference photo of our mascot character 脳手郎 (Noutero). Generate a completely brand new image featuring this EXACT character — preserve all visual details: gold metallic body, pink brain exposed on top of head, blue beak, round eyes. Show the character in this specific scene:

${sceneDesc}

Style requirements: photorealistic, cinematic, 3D figurine render, dramatic lighting, epic atmosphere, high-end collectible figurine photography. No text, no words, no captions anywhere in the image.`;

  const blob = new Blob([refBuffer], { type: 'image/png' });
  const formData = new FormData();
  formData.append('image', blob, 'noutero.png');
  formData.append('prompt', prompt);
  formData.append('model', 'gpt-image-1');
  formData.append('size', '1024x1024');
  formData.append('quality', 'high');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    const text = await response.text().catch(() => '(empty)');
    throw new Error(`Edit API HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`Edit API (${response.status}): ${data.error?.message || JSON.stringify(data).slice(0, 300)}`);
  }
  return data.data?.[0]?.b64_json || null;
}

async function uploadToStorage(b64Data, variationId) {
  const buffer = Buffer.from(b64Data, 'base64');
  const fileName = `article-images/v${variationId}-${Date.now()}.png`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/magazine-media/${fileName}`;
  const r = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Storage upload failed (${r.status}): ${err}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/magazine-media/${fileName}`;
}

async function updateVariation(id, imageUrls) {
  const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/magazine_variations?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({ blog_image_url: urls[0] || null, blog_image_urls: urls }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Supabase PATCH failed: ${r.status} ${err}`);
  }
}

function embedImagesInBody(blogBody, imageUrls) {
  const [topUrl, midUrl, botUrl] = imageUrls;
  const text = (blogBody || '').trim();
  const paras = text.split(/\n\n+/);
  const total = paras.length;
  const midIdx = Math.floor(total / 2);

  const top = paras.slice(0, midIdx).join('\n\n');
  const bottom = paras.slice(midIdx).join('\n\n');

  const parts = [];
  if (topUrl) parts.push(`📷 ${topUrl}`);
  if (top) parts.push(top);
  if (midUrl) parts.push(`📷 ${midUrl}`);
  if (bottom) parts.push(bottom);
  if (botUrl) parts.push(`📷 ${botUrl}`);

  return parts.join('\n\n');
}

async function updateVariationWithBody(id, imageUrls, bodyMail) {
  const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const newBody = embedImagesInBody(bodyMail, urls);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/magazine_variations?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({ blog_image_url: urls[0] || null, blog_image_urls: urls, body_mail: newBody }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Supabase PATCH failed: ${r.status} ${err}`);
  }
  return newBody;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { topicId, variationId } = req.body;
  if (!topicId) return res.status(400).json({ error: 'topicId is required' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

  const log = [];
  const step = (msg) => { log.push(msg); console.log('[generate-images]', msg); };

  try {
    // Step 1: 参考画像をファイルシステムから読み込む
    step('📥 脳手郎参考画像を読み込み中 (public/noutero-refs/)...');
    const refs = loadNouteroRefs(step);
    if (refs.length === 0) {
      return res.status(500).json({
        error: '参考画像ファイルが見つかりません (public/noutero-refs/)',
        log,
      });
    }
    step(`✅ 参考PNG ${refs.length}枚読込完了`);

    // Step 2: バリエーション取得
    step('📋 バリエーション取得中...');
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/magazine_variations?topic_id=eq.${topicId}&select=id,variation_no,summary,body_mail,blog_title,blog_body`,
      { headers: sbHeaders }
    );
    let variations = await r.json();
    if (!Array.isArray(variations) || variations.length === 0) {
      return res.status(404).json({ error: 'No variations found for this topic' });
    }
    if (variationId) {
      variations = variations.filter(v => v.id === variationId);
      if (variations.length === 0) return res.status(404).json({ error: 'Variation not found' });
    }
    step(`✅ ${variations.length}記事取得`);

    // Step 3: 各バリエーションの画像生成
    const results = [];
    for (const v of variations) {
      step(`\n🖼️ #${v.variation_no} 開始...`);
      try {
        // 記事を読んで3シーンを設計
        step(`  🧠 #${v.variation_no} シーン設計中 (GPT-4o-mini)...`);
        const scenes = await designScenes(v);
        step(`  top: ${scenes.top?.slice(0, 60)}...`);
        step(`  mid: ${scenes.middle?.slice(0, 60)}...`);
        step(`  bot: ${scenes.bottom?.slice(0, 60)}...`);

        const imageUrls = [];
        for (const pos of ['top', 'middle', 'bottom']) {
          step(`  📸 [${pos}] 生成中...`);
          try {
            const b64 = await generateArticleImage(refs[0], scenes[pos]);
            if (b64) {
              const url = await uploadToStorage(b64, `${v.id}-${pos}`);
              imageUrls.push(url);
              step(`  ✅ [${pos}] 完了`);
            } else {
              step(`  ⚠️ [${pos}] b64データなし`);
            }
          } catch (e) {
            step(`  ❌ [${pos}] ${e.message}`);
          }
        }

        if (imageUrls.length > 0) {
          const newBody = await updateVariationWithBody(v.id, imageUrls, v.body_mail || '');
          results.push({ variationId: v.id, variation_no: v.variation_no, imageUrls, scenes, blog_body: newBody });
          step(`✅ #${v.variation_no} 完了 (${imageUrls.length}枚、ブログ本文に埋め込み済み)`);
        } else {
          results.push({ variationId: v.id, variation_no: v.variation_no, imageUrls: [] });
        }
      } catch (e) {
        step(`❌ #${v.variation_no} エラー: ${e.message}`);
        results.push({ variationId: v.id, variation_no: v.variation_no, error: e.message });
      }
    }

    const totalImages = results.reduce((n, r) => n + (r.imageUrls?.length || 0), 0);
    if (totalImages === 0) {
      const firstError = results.find(r => r.error)?.error || '画像が1枚も生成できませんでした';
      return res.status(500).json({ success: false, error: firstError, results, log });
    }
    return res.status(200).json({ success: true, results, log });
  } catch (err) {
    console.error('[generate-images] error:', err);
    return res.status(500).json({ error: err.message, log });
  }
}
