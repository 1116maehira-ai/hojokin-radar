// POST /api/youtube-to-articles
// Body: { youtubeUrl, recipientCategory? }
// Returns: { success, topicId, articles, log, message }
// Phase 1: transcript → 4 articles → Supabase + Wix blog (text only, <60s)
// Phase 2: image generation is a separate step per article

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

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
  try {
    const r = await fetch(`${BASE_URL}/api/fetch-youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, url: `https://www.youtube.com/watch?v=${videoId}` }),
    });
    if (r.ok) {
      const data = await r.json();
      if (data.transcript || data.text || data.content) {
        return data.transcript || data.text || data.content;
      }
    }
  } catch (_) {}

  for (const lang of ['ja', 'en']) {
    const r = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`,
    );
    if (!r.ok) continue;
    const data = await r.json();
    const events = data?.events || [];
    const text = events
      .filter(e => e.segs)
      .flatMap(e => e.segs.map(s => s.utf8))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 100) return text;
  }

  throw new Error('Could not retrieve transcript. Make sure the video has captions enabled.');
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
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
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
- メルマガ本文(body_mail): 800〜1200文字
- ブログタイトル(blog_title): SEOを意識した魅力的なタイトル
- ブログ本文(blog_body): 1000〜1500文字、## で小見出しOK
- 画像プロンプト(image_prompts): 3つのDALL-E用英語プロンプト
  * image_prompts[0]: 脳手郎キャラクターが主役のシーン
  * image_prompts[1]: 脳手郎キャラクターが主役の別シーン
  * image_prompts[2]: キャラクターなし、記事テーマを表す画像

以下のJSON形式で返してください:
{
  "articles": [
    {
      "tone": "便利・時短",
      "subject": "件名テキスト",
      "body_mail": "メルマガ本文テキスト",
      "blog_title": "ブログタイトル",
      "blog_body": "ブログ本文テキスト",
      "image_prompts": ["prompt1", "prompt2", "prompt3"]
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
  const { data, error } = await supabase
    .from('magazine_variations')
    .insert({
      topic_id: topicId,
      variation_no: variationNo,
      body_mail: article.body_mail,
      subjects: JSON.stringify({ [article.tone]: article.subject }),
      categories: [recipientCategory],
      selected: false,
      post_blog: wixPostId ? true : false,
      scheduled_at: null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return data.id;
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

    const { data: topic, error: topicError } = await supabase
      .from('magazine_topics')
      .insert({
        title: `YouTube: ${videoId}`,
        source_url: youtubeUrl,
        source_text: transcript.slice(0, 8000),
        status: 'draft',
      })
      .select('id')
      .single();

    if (topicError) throw new Error(`Supabase topic error: ${topicError.message}`);
    const topicId = topic?.id;
    step(`✅ トピック作成 (ID: ${topicId})`);

    step('✍️ Claude で記事生成中（4記事）...');
    const articles = await generateArticles(transcript);
    step(`✅ 記事生成完了 (${articles.length}記事)`);

    const results = [];

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];

      // Post to Wix blog (text only — images generated separately in Phase 2)
      step(`📰 [記事${i + 1}/${articles.length}: ${article.tone}] Wixブログ投稿中...`);
      const wixPostId = await postToBlog(article.blog_title, article.blog_body, []);
      step(`✅ ブログ投稿${wixPostId ? '完了' : '失敗'}: ${wixPostId || 'error'}`);

      step(`💾 Supabase に保存中...`);
      const variationId = await saveToSupabase(
        article, topicId, i + 1, recipientCategory, wixPostId,
      );
      step(`✅ Supabase 保存完了 (variation_id: ${variationId})`);

      results.push({
        tone: article.tone,
        subject: article.subject,
        blog_title: article.blog_title,
        wixPostId,
        variationId,
        imageUrls: [], // images generated in Phase 2
      });
    }

    if (topicId) {
      await supabase.from('magazine_topics').update({ status: 'expanded' }).eq('id', topicId);
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
