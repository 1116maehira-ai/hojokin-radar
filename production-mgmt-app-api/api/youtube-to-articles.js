// POST /api/youtube-to-articles
// Body: { youtubeUrl, recipientCategory? }
// Returns: { success, topicId, articles, log, message }
// Phase 1: transcript → 4 articles → Supabase + Wix blog (text only, <60s)
// Phase 2: image generation is a separate step per article

import { YoutubeTranscript } from 'youtube-transcript';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://vfgujkocemgezvcuixpp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmZ3Vqa29jZW1nZXp2Y3VpeHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjA4MTEsImV4cCI6MjA5MDEzNjgxMX0.-IxXJw7St2pLKSXKDU3dunJdgIkL-bhobD53SS-ci1s';

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Supabase ${table} insert error: ${JSON.stringify(data)}`);
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpdate(table, filter, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
}

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: YouTube transcript
// ─────────────────────────────────────────────────────────────────────────────

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/\s]+)/,
    /youtube\.com\/shorts\/([^&?/\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function getYouTubeTranscript(videoId) {
  let transcript = '';
  let title = '';

  // Try youtube-transcript package (handles auto-generated captions / asr)
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ja' })
      .catch(() => YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' }));
    if (items && items.length > 0) {
      transcript = items.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
      console.log(`[transcript] got ${transcript.length} chars`);
    }
  } catch (e) {
    console.error('[transcript] youtube-transcript failed:', e.message);
  }

  // Get title via oEmbed (reliable public API, works from any server IP)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const r = await fetch(oembedUrl);
    console.log(`[oembed] status: ${r.status}`);
    if (r.ok) {
      const d = await r.json();
      title = d.title || '';
      console.log(`[oembed] title: ${title}`);
    } else {
      const body = await r.text();
      console.error(`[oembed] error body: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.error('[oembed] fetch failed:', e.message);
  }

  if (transcript) return transcript;
  if (title) return `【動画タイトル】\n${title}\n\n※字幕が取得できなかったため、タイトルのみを元に記事を生成します。`;
  // Last resort: use video URL so Claude can still attempt article generation
  return `【YouTube動画】\nhttps://www.youtube.com/watch?v=${videoId}\n\n※この動画の情報を元に補助金・ビジネスに関する記事を生成してください。`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Generate 4 articles with Claude
// ─────────────────────────────────────────────────────────────────────────────

async function generateArticles(transcript) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5000,
      system: `あなたはTENOHIRA（テノヒラ）の前平雄一朗として、補助金・ビジネスコンサルティングの専門家視点でメルマガ・ブログ記事を書きます。
文章スタイル: 親しみやすく専門的、読者の課題に寄り添い、最終的に「ご相談ください」という行動を促す。
必ずJSON形式のみで返してください。余計な説明は一切不要です。`,
      messages: [
        {
          role: 'user',
          content: `以下のYouTube動画の文字起こしから、4つの異なる切り口でメルマガ記事を生成してください。

文字起こし:
${transcript.slice(0, 6000)}

【4つの切り口】
1. 便利・時短 — 業務効率化・時間節約の観点から読者の日常を変える気づき
2. 新常識・気づき — 「実は知らなかった！」という驚きと業界の常識を覆す情報
3. 面白さ・意外性 — 「えっ、そうなの!?」思わず誰かに話したくなる意外な事実
4. 体験・共感 — 具体的な体験談ベース、最後は「お気軽にご相談ください」のCTAで着地

各記事の要件:
- メルマガ件名(subject): 読者が開封したくなる30文字以内
- メルマガ本文(body_mail): 1000〜1200文字（読み応えのある内容で）
- ブログタイトル(blog_title): SEOを意識した魅力的なタイトル
- ブログ本文(blog_body): 1000〜1200文字、## で小見出しOK

以下のJSON形式のみで返してください（余計な説明は不要）:
{
  "articles": [
    {
      "tone": "便利・時短",
      "subject": "件名テキスト",
      "body_mail": "メルマガ本文テキスト",
      "blog_title": "ブログタイトル",
      "blog_body": "ブログ本文テキスト"
    }
  ]
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude API error: ${err.error?.message}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');
  return JSON.parse(jsonMatch[0]).articles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 & 4: Image generation — deferred (Phase 2, separate endpoint)
// Images take 3-5 min for 12 generations; Phase 1 is text-only to stay <60s
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Post to Wix blog (via existing /api/post-blog)
// ─────────────────────────────────────────────────────────────────────────────

async function postToBlog(blogTitle, blogBody, imageUrls) {
  const lines = blogBody.split('\n').filter(l => l.trim());
  const sectionSize = Math.max(1, Math.floor(lines.length / (imageUrls.length + 1)));

  let bodyWithImages = '';
  let imageIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    bodyWithImages += lines[i] + '\n';
    if ((i + 1) % sectionSize === 0 && imageIndex < imageUrls.length) {
      const imgUrl = imageUrls[imageIndex];
      if (imgUrl) bodyWithImages += `📷 ${imgUrl}\n`;
      imageIndex++;
    }
  }
  while (imageIndex < imageUrls.length) {
    const imgUrl = imageUrls[imageIndex];
    if (imgUrl) bodyWithImages += `📷 ${imgUrl}\n`;
    imageIndex++;
  }

  const r = await fetch(`${BASE_URL}/api/post-blog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: blogTitle, body: bodyWithImages }),
  });

  const data = await r.json();
  if (!r.ok) {
    console.error('Blog post failed:', data);
    return null;
  }
  return data.postId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6: Save to Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function saveToSupabase(article, topicId, variationNo, recipientCategory, wixPostId) {
  const row = await sbInsert('magazine_variations', {
    topic_id: topicId,
    variation_no: variationNo,
    body_mail: article.body_mail,
    subjects: [article.subject],
    summary: `[${article.tone}] ${article.blog_title || ''}`,
    categories: [recipientCategory],
    selected: false,
    scheduled_at: null,
    blog_title: article.blog_title || null,
    blog_body: article.blog_body || null,
  });
  return row?.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { youtubeUrl, recipientCategory = '直クライアント' } = req.body;

  if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });

  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  const log = [];
  const step = (msg) => {
    log.push(msg);
    console.log(`[youtube-to-articles] ${msg}`);
  };

  try {
    step('📝 文字起こし取得中...');
    const transcript = await getYouTubeTranscript(videoId);
    step(`✅ 文字起こし完了 (${transcript.length}文字)`);

    const topic = await sbInsert('magazine_topics', {
      title: `YouTube: ${videoId}`,
      source_url: youtubeUrl,
      source_text: transcript.slice(0, 8000),
      status: 'draft',
    });
    const topicId = topic?.id;
    step(`✅ トピック作成 (ID: ${topicId})`);

    step('✍️ Claude で記事生成中（4記事）...');
    const articles = await generateArticles(transcript);
    step(`✅ 記事生成完了 (${articles.length}記事)`);

    // Supabase保存のみ（Wix投稿は別途Phase 2）
    step('💾 Supabase保存中（4記事並列）...');
    const results = await Promise.all(
      articles.map(async (article, i) => {
        const variationId = await saveToSupabase(article, topicId, i + 1, recipientCategory, null).catch(e => { console.error('saveToSupabase failed:', e); return null; });
        return {
          tone: article.tone,
          subject: article.subject,
          blog_title: article.blog_title,
          wixPostId: null,
          variationId,
          imageUrls: [],
        };
      })
    );
    step(`✅ 全記事保存完了`);

    if (topicId) {
      await sbUpdate('magazine_topics', `id=eq.${topicId}`, { status: 'expanded' });
    }

    return res.status(200).json({
      success: true,
      topicId,
      recipientCategory,
      articles: results,
      log,
      message: `✅ 完了！${articles.length}記事をWixブログに投稿し、Supabaseに保存しました。\n画像は別途生成します。配信カテゴリ: ${recipientCategory}`,
    });
  } catch (err) {
    console.error('[youtube-to-articles] error:', err);
    return res.status(500).json({ error: err.message, log });
  }
}
