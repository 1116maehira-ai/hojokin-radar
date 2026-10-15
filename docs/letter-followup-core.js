(function(root){
  'use strict';
  const VERSION='20261016-letter-followup-v4';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const body=x=>String(x||'').replace(/\r\n?/g,'\n').trim();
  const ops=c=>c.source_data?.sales_ops||{};
  const bundle=c=>ops(c).letter_followup||{schema_version:1,scripts:[]};
  const scripts=c=>bundle(c).scripts||[];
  const revisions=c=>ops(c).letter_versions||[];
  const deliveries=c=>(ops(c).letter_deliveries||[]).filter(d=>!d.voided_at);
  const currentLetter=c=>ops(c).letter||{};
  const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  const realDay=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(x||''))return false;const d=new Date(x+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===x;};
  function addMonths(date,months){if(!realDay(date)||!Number.isInteger(months)||months<0)throw Error('日付・月数を確認してください');const [y,m,d]=date.split('-').map(Number),total=y*12+m-1+months,year=Math.floor(total/12),month=total%12,last=new Date(Date.UTC(year,month+1,0)).getUTCDate();return [year,String(month+1).padStart(2,'0'),String(Math.min(d,last)).padStart(2,'0')].join('-');}
  const uid=()=>root.crypto.randomUUID();
  async function digest(s){const a=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(a),v=>v.toString(16).padStart(2,'0')).join('');}
  function recipient(text,c){const line=body(text).split('\n').slice(0,7).find(l=>/様\s*$/.test(l));return line?line.replace(/様\s*$/,'').trim():String(c.ceo_name||'');}
  function evidenceQuote(text){const p=body(text).split(/\n\s*\n/).map(x=>x.trim());return p.find(x=>/拝見|拝読|心に残|共感|理念|御社が|大城様が/.test(x)&&!/^突然/.test(x))||p.find(x=>x.length>25&&!/様\s*$/.test(x))||'';}
  function defaults(c,letter=currentLetter(c)){
    const text=body(letter.body),quote=evidenceQuote(text);
    return {recipient:recipient(text,c),interest:quote.split(/[。\n]/).find(x=>x.trim())||quote,question:'会社として大切にされてきた考えや、これからの世代にも残したいことについて、お聞かせいただけますでしょうか。',evidence_quote:quote,offer:'consultation',offer_terms:'',author:'前平雄一朗'};
  }
  async function revision(c,letter,by){
    const text=body(letter.body);if(!text)throw Error('先に手紙本文を共有保存してください');
    const hash=await digest(String(c.id)+'\n'+text);
    return {id:'letter-'+hash.slice(0,24),hash,body:text,company_name:c.company_name,recipient:recipient(text,c),letter_saved_at:letter.saved_at||null,captured_at:new Date().toISOString(),by};
  }
  function nodes(ctx){
    const interest=body(ctx.interest),question=body(ctx.question);
    const n=(title,say,options,note='')=>({title,say,options,note});
    const exits=[['今は考えていない','notnow'],['インタビューは苦手','camera'],['無料ですか？','price'],['今回は結構です','soft_no'],['今後の連絡も不要','declined']];
    return {
      start:n('まず、代表者へのお取次ぎをお願いする','{{intro}} お手紙にも書いた御社の歩みについて、私自身、直接お話を伺いたくお電話いたしました。{{recipient}}様にお取り次ぎいただけませんでしょうか。', [['代表者につながった','person'],['どのようなご用件ですか？','purpose'],['不在です','absent'],['手紙は渡ったか分からない','unseen'],['社長へ伝えておきます','relay'],['今回は結構です','soft_no'],['今後の連絡も不要','declined']], '手紙を書いた前平本人が電話する台本です。受付の受領を、代表者の既読と取り違えない。'),
      purpose:n('手紙を書いた動機を、短く伝える','私は沖縄で映像制作の会社を営んでおります。お手紙で触れさせていただいた「'+interest+'」というお話に心を動かされました。その背景にどのような想いやご苦労があったのか、経営者の一人として直接伺えればと思っております。まずはご挨拶のお時間をいただけないかというお願いです。', [['おつなぎします','person'],['社長へ伝えておきます','relay'],['不在です','absent'],['営業ですか？','sales'],...exits]),
      unseen:n('手紙が届いたか分からないとき','ありがとうございます。まだお目通しいただけていなくても大丈夫です。御社の歩みや大切にされていることに感銘を受け、前平という者がお話を伺いたいとお伝えいただけますでしょうか。', [['用件を聞かれた','purpose'],['伝えておきます','relay'],['担当者なら話せる','staff'],['今回は結構です','soft_no'],['今後の連絡も不要','declined']], '届いたこと・読んだことは確認できた範囲だけで話す。'),
      person:n('代表者につながったら','お忙しいところありがとうございます。株式会社TENOHIRA代表の前平雄一朗と申します。先日、お手紙を書かせていただきました。今、30秒ほどだけ、お電話の理由をお伝えしてもよろしいでしょうか。', [['どうぞ','listen'],['手紙は見ていない','listen'],['今は忙しい','busy'],['今回は結構です','soft_no'],['今後の連絡も不要','declined']]),
      listen:n('感銘を受けた理由と、会いたい気持ちを伝える','お手紙で触れさせていただいた「'+interest+'」というお話が、心に残っております。そこに至るまでに、どんな想いやご苦労があったのか、ぜひ直接伺いたいと思っております。20〜30分ほど、ご挨拶に伺う機会をいただけませんでしょうか。', [['会ってもよい','date'],['少しお話ししてくれた','question'],['今は忙しい','busy'],['営業ですか？','sales'],...exits], 'ここで長いインタビューを始めない。まず会う機会をお願いし、相手が話し始めたら聞く。'),
      question:n('相手がお話ししてくださったら',question, [['お話ししてくれた','invite'],['会って話そう','date'],['今は忙しい','busy'],['今回は結構です','soft_no']], '質問は一つずつ。答えを遮らず、相手が実際に話した言葉をメモする。'),
      invite:n('伺ったお話を、面会につなぐ','お聞かせいただきありがとうございます。そのお話を、ぜひもう少し詳しく伺いたいです。まずは撮影なしで、20〜30分ほどご挨拶に伺ってもよろしいでしょうか。', [['会ってもよい','date'],['時期が先なら','later'],['資料が欲しい','material'],['今回は結構です','soft_no'],['今後の連絡も不要','declined']]),
      absent:n('代表者が不在なら','承知いたしました。改めてお電話するなら、いつ頃がご迷惑になりにくいでしょうか。もし代表者様へのお取次ぎが難しければ、御社の歩みや会社づくりについてお話を伺えるご担当者様をご紹介いただけますとありがたいです。', [['戻る時間を教えてくれた','callback'],['担当者を紹介してくれた','staff'],['社長へ伝えておく','relay'],['資料なら受け取れる','material'],['今回は結構です','soft_no'],['今後の連絡も不要','declined']]),
      staff:n('ご担当者との面会もお願いする','ありがとうございます。まずはご担当の方から、会社として大切にされていることや、これまでの歩みを伺えればありがたいです。ご挨拶に20〜30分ほど伺うことは可能でしょうか。', [['会ってもよい','date'],['どんな用件？','purpose'],['資料を先に欲しい','material'],['今は難しい','soft_no']], '代表者本人の体験・気持ちは、担当者に代弁を求めない。'),
      sales:n('営業ですか？と聞かれたら','はい、映像制作を仕事にしておりますので、お役に立てることがあれば将来ご相談できればとも思っております。ただ、今回お手紙を書いたのは、まず御社の歩みやお考えを直接伺いたかったからです。今回は撮影なしのご挨拶として、お時間をいただけないでしょうか。', [['挨拶ならよい','date'],['資料だけ欲しい','material'],['今は考えていない','notnow'],['今回は結構です','soft_no'],['今後の連絡も不要','declined']], '映像制作の仕事や将来の提案の可能性を隠さず、面会と制作契約を分ける。'),
      notnow:n('今は動画を考えていない','承知いたしました。今は映像制作をお考えでないということですね。今回は撮影や制作を決めていただくお願いではなく、手紙に書いたお話を、私自身が直接伺えればと思っております。まず撮影なしのご挨拶という形でも、今は難しいでしょうか。', [['ご挨拶ならよい','date'],['担当者ならよい','staff'],['また時期を改めて','later'],['資料なら受け取れる','material'],['面会も今回は結構','soft_no'],['今後の連絡も不要','declined']], '面会のお願いは一度だけ。再び断られたら、相手の意思に沿って終了または了承された次の接点へ。'),
      greeting:n('まずご挨拶する機会の相談','今すぐの制作ではなく、手紙に書いたお考えについて、私自身が直接伺いたいと思っております。撮影なしで20〜30分ほど、ご挨拶に伺ってもよろしいでしょうか。', [['よい','date'],['今は難しい','soft_no'],['今後の連絡も不要','declined']]),
      camera:n('インタビューは苦手','そうなのですね。カメラを向けられると、普段どおりには話しづらいですよね。今回はカメラを持たず、まず普通にお話を伺うご挨拶で結構です。そのような形なら、お会いいただくことは可能でしょうか。', [['それならよい','date'],['無料ですか？','price'],['今は難しい','soft_no'],['今後の連絡も不要','declined']], '面会了承を撮影了承にしない。撮影・公開は別途相談する。'),
      price:n('無料ですか？','{{offer}}', [['お話しするだけならよい','date'],['映像制作の金額も知りたい','production_price'],['資料を先に欲しい','material'],['今回は結構です','soft_no']], '何が無料かを分けて伝える。面会の説明から、求められていない有料プランの列挙へ飛ばない。'),
      production_price:n('映像制作の費用を聞かれたら','企業ストーリーは税別50万円定額、周年向けは税別70〜100万円、内容を広げたプランは税別100〜150万円が目安です。内容と見積りをご確認いただいてから、ご判断いただきます。まずはお話を伺い、必要があればご提案いたします。', [['一度話したい','date'],['資料を見たい','material'],['今は考えていない','notnow'],['今回は終了','end']]),
      soft_no:n('今回は結構です、と言われたら','承知いたしました。今回はご面会のお願いは控えます。もし差し支えなければ、私どもの仕事が分かる短い資料だけ、お送りしてもよろしいでしょうか。', [['資料ならよい','material'],['資料も不要・今回は終了','end'],['時期を改めてならよい','later'],['今後の連絡も不要','declined']], '「今回は見送り」を営業停止に自動変換しない。資料・将来連絡の相談は一度だけ。重ねて断られたら終了。'),
      material:n('資料を送ってよいと了承されたら','ありがとうございます。ご覧いただきやすい資料をお送りしたいので、資料の内容と、送付してよい窓口・方法を伺ってもよろしいでしょうか。送付後、確認のお電話をしても差し支えないでしょうか。', [['資料送付と再連絡を了承','material_followup'],['資料だけ・電話は不要','material_only'],['送付先を今は確認できない','end'],['送付も連絡も不要','declined']], '了承された資料・方法・窓口を記録する。未公開の個人メールは公開リストに書かない。この画面はメールを送信しない。'),
      material_followup:n('資料送付後の次の接点を決める','ありがとうございます。いつ頃にご連絡すると、ご迷惑になりにくいでしょうか。お電話では「手紙と資料の件で、TENOHIRAの前平です」とお伝えいたします。', [['希望時期を聞けた・記録する','record'],['3か月以降にしてほしい','later'],['資料だけでよい','material_only']], '資料送付と再連絡の了承は別々に記録。送付前に「送りました」と言わない。'),
      material_only:n('資料だけ、電話はしないでほしい','承知いたしました。ご了承いただいた資料だけお送りし、確認のお電話は控えます。ご関心を持っていただけましたら、資料に記載する前平宛てにお声掛けいただけますと幸いです。本日はありがとうございました。', [['実際の了承内容を記録','record']], '資料送付の了承を、次回電話の了承にしない。電話不要の範囲を記録し尊重する。'),
      relay:n('社長へ伝えておきます','ありがとうございます。「手紙を書いたTENOHIRA代表の前平が、御社の歩みやお考えに感銘を受け、まずご挨拶してお話を伺いたい」とお伝えいただけますと幸いです。後日、私から確認のお電話をしても差し支えないでしょうか。', [['再連絡してよい','callback'],['資料も送ってよい','material'],['関心があれば先方から連絡','end'],['今回は終了','end']], '伝言を面会承諾と数えない。「伝えておきます」で終わらず、次に連絡してよいか一度確認する。'),
      busy:n('今は忙しい','お忙しいところ失礼いたしました。今は難しいということでしたら、時期を改めてご連絡してもよろしいでしょうか。', [['近いうちにかけ直してよい','callback'],['数か月後ならよい','later'],['資料だけ欲しい','material'],['今回は終了','end'],['今後の連絡も不要','declined']]),
      later:n('3か月・半年・1年後の接点を相談する','ありがとうございます。例えば3か月後、半年後、1年後では、いつ頃がよろしいでしょうか。次も、御社の歩みについてお話を伺いたい件で、私、前平からご連絡いたします。', [['3か月後を了承','after3'],['半年後を了承','after6'],['1年後を了承','after12'],['先方が時期を指定','callback'],['こちらからの再連絡は不要','end']], 'こちらが勝手に期限を決めない。相手が了承した場合だけ次回予定に残す。'),
      after3:n('3か月後の再連絡を了承されたら','ありがとうございます。それでは3か月後を目安に、私、前平から改めてご連絡いたします。本日はお時間をいただきありがとうございました。', [['了承された内容を記録','record']], '記録画面の「3か月後」を押し、具体的な日付を確認して保存する。'),
      after6:n('半年後の再連絡を了承されたら','ありがとうございます。それでは半年後を目安に、私、前平から改めてご連絡いたします。本日はお時間をいただきありがとうございました。', [['了承された内容を記録','record']], '記録画面の「半年後」を押し、具体的な日付を確認して保存する。'),
      after12:n('1年後の再連絡を了承されたら','ありがとうございます。それでは1年後を目安に、私、前平から改めてご連絡いたします。本日はお時間をいただきありがとうございました。', [['了承された内容を記録','record']], '記録画面の「1年後」を押し、具体的な日付を確認して保存する。'),
      callback_permission:n('確認後、連絡してよいか伺う','正確な内容を確認してからご案内いたします。私から改めてご連絡しても差し支えないでしょうか。', [['よい','callback'],['資料だけ欲しい','material'],['不要','end']]),
      callback:n('次の接点を具体的にする','ありがとうございます。何日頃、どの時間帯でしたらご迷惑になりにくいでしょうか。次のお電話でも「お手紙の件で、TENOHIRAの前平です」とお伝えします。', [['希望日時を聞けた・記録する','record'],['数か月後にしてほしい','later'],['先方から連絡する','end']], '再連絡の了承と、時期・用件・窓口を記録する。折り返しを当然のように求めない。'),
      date:n('面会の候補日時を伺う','ありがとうございます。まずは撮影なしのご挨拶として、20〜30分ほど伺えればと思います。ご都合のよい曜日や時間帯はございますでしょうか。訪問が難しければ、オンラインでも大丈夫です。', [['希望日時を聞けた','finish'],['後日の日程調整を了承','callback'],['オンラインを希望','finish']], '予定を確認し、相手と日時・場所・参加者を合意して確定する。面会希望だけで適格商談に数えない。'),
      declined:n('今後の連絡も不要、と明示されたら','承知いたしました。今後、この件でのご連絡は控えます。お忙しいところご対応いただき、ありがとうございました。失礼いたします。', [['電話結果を記録','record']], '明確な停止は尊重する。ここから資料提案・再説得へ戻らない。媒体・範囲の指定は実際の言葉を記録する。'),
      end:n('名前と用件を残して、丁寧に終える','本日はご対応いただき、ありがとうございました。TENOHIRAの前平雄一朗と申します。もし後日、お手紙の内容についてお話を聞かせていただける機会がございましたら、前平宛てにお声掛けいただけますと幸いです。失礼いたします。', [['電話結果を記録','record']], '今回は終了。再連絡の了承がなければ、予定を勝手に作らない。'),
      finish:n('面会の目的と、次の連絡を確認する','ありがとうございます。それでは、御社の歩みや大切にされてきたことを伺うご挨拶として、私、前平が伺います。お聞きしたご希望に合わせて予定を確認し、日時の確認をご連絡いたします。本日はありがとうございました。', [['電話結果を記録','record']], '面会候補と確定予約を区別。撮影や制作の契約・承諾とは別。')
    };
  }
  async function build(c,rev,context,by){
    const ctx={...defaults(c,{body:rev.body}),...context};
    for(const k of ['recipient','interest','question','evidence_quote'])if(!body(ctx[k]))throw Error('宛名・関心・質問・手紙の根拠箇所を入力してください');
    if(!rev.body.includes(ctx.evidence_quote))throw Error('根拠の一節は元の手紙からそのまま選んでください');
    if(!['consultation','raw_interview','unknown'].includes(ctx.offer))throw Error('費用の案内を選んでください');
    if(ctx.offer==='raw_interview'&&!body(ctx.offer_terms))throw Error('無料撮影の範囲と有料になる条件を入力してください');
    return {id:uid(),generator_version:VERSION,source_letter_revision_id:rev.id,source_letter_hash:rev.hash,source_letter_snapshot:clone(rev),context:ctx,nodes:nodes(ctx),status:'draft',review:null,created_at:new Date().toISOString(),created_by:by};
  }
  function payload(s){return JSON.stringify([s.source_letter_hash,s.context,s.nodes]);}
  function reviewed(s){return !!(s?.review&&s.review.snapshot===payload(s)&&s.review.by&&s.review.checked_at);}
  function script(c,id){return scripts(c).find(s=>s.id===(id||bundle(c).active_script_id))||scripts(c).at(-1)||null;}
  function delivery(c,s){return deliveries(c).filter(d=>d.letter_revision_id===s?.source_letter_revision_id&&d.letter_hash===s?.source_letter_hash).at(-1)||null;}
  function changed(c,s){return !!s&&body(currentLetter(c).body)!==body(s.source_letter_snapshot.body);}
  function state(c,s=script(c)){if(!s)return '未作成';if(changed(c,s)&&!delivery(c,s))return '手紙の変更あり';if(!reviewed(s))return '内容確認待ち';if(!delivery(c,s))return 'お届け確認待ち';return '台本確認済み';}
  function insert(op,rev,s){
    op.letter_versions=op.letter_versions||[];if(!op.letter_versions.some(v=>v.id===rev.id))op.letter_versions.push(clone(rev));
    const b=op.letter_followup||{schema_version:1,scripts:[]};b.scripts=b.scripts||[];
    if(!b.scripts.some(x=>x.id===s.id))b.scripts.push(clone(s));b.active_script_id=s.id;op.letter_followup=b;
  }
  function recordDelivery(op,s,data,by,today=day()){
    if(!realDay(data.occurred_on)||data.occurred_on>today)throw Error('届けた日は今日以前の実在する日付を選んでください');
    if(!['deposited','recipient','staff','post'].includes(data.method))throw Error('届けた方法を選んでください');
    if(!body(data.delivered_by))throw Error('実際に届けた担当者名を入力してください');
    if(!['unknown','received','read'].includes(data.recipient_state))throw Error('本人への受け渡し状況を選んでください');
    op.letter_deliveries=op.letter_deliveries||[];
    if(op.letter_deliveries.some(d=>!d.voided_at&&d.letter_revision_id===s.source_letter_revision_id&&d.occurred_on===data.occurred_on&&d.method===data.method&&d.delivered_by===data.delivered_by))throw Error('同じお届け記録があります。履歴を確認してください');
    const e={...clone(data),id:uid(),letter_revision_id:s.source_letter_revision_id,letter_hash:s.source_letter_hash,recorded_by:by,recorded_at:new Date().toISOString()};op.letter_deliveries.push(e);return e;
  }
  function reasons(c,s=script(c),so=root.SalesOps,today=day()){
    const out=[];if(!s)return ['専用台本が未作成'];if(!reviewed(s))out.push('台本内容の確認待ち');
    const d=delivery(c,s);if(!d)out.push('この手紙の版のお届け記録待ち');
    if(changed(c,s)&&!d)out.push('手紙本文が変更されています');
    if(d&&(!realDay(d.occurred_on)||d.occurred_on>today))out.push('お届け日の確認待ち');
    if(s.context.recipient!==recipient(s.source_letter_snapshot.body,c))out.push('手紙の宛名と台本の宛名が異なります');
    const person=v=>String(v||'').normalize('NFKC').replace(/代表取締役|取締役|代表理事|代表社員|会長|社長|CEO|様|\s/g,'');
    if(!person(c.ceo_name)||person(s.context.recipient)!==person(c.ceo_name))out.push('手紙の宛名と現在の代表者の一致確認待ち');
    if(!so)return [...out,'企業情報の確認機能が未読込'];
    out.push(...so.mailReasons(c,today));if(!so.verified(c,'phone',today))out.push('電話番号の根拠確認待ち');
    if(ops(c).contact?.phone_usable!==true)out.push('営業電話の窓口・利用条件確認待ち');
    return [...new Set(out)];
  }
  function renderNode(s,key,c,caller){
    const node=nodes(s.context)[key]||s.nodes?.[key];if(!node)return null;
    const d=delivery(c,s),ctx=s.context,author=ctx.author||'前平雄一朗';
    const self=/前平|MAGE/i.test(caller),host=self?'私':'弊社代表の前平';
    const writer=self?'私':`弊社の${author}`;
    let intro='株式会社TENOHIRA代表の前平雄一朗と申します。先日、'+ctx.recipient+'様宛てにお手紙をしたためました。';
    if(d){const who=/前平|MAGE/i.test(d.delivered_by)&&/前平|MAGE/i.test(caller)?'私':d.delivered_by===caller?'私':`弊社の${d.delivered_by}`;const name=ctx.recipient+'様';const lead=`株式会社TENOHIRAの${caller}と申します。${d.occurred_on}に${who}が${name}宛てのお手紙を`;
      intro=lead+({deposited:'直接お届けし、受付の方にお預かりいただいた件でお電話しました。',recipient:'直接お渡しした件でお電話しました。',staff:'お届けし、ご担当の方にお預かりいただいた件でお電話しました。',post:'お送りした件でお電話しました。'}[d.method]);
    }
    const offer=ctx.offer==='raw_interview'?`今回追加でご案内する条件として、インタビューの撮影と編集・加工をしないデータのお渡しは無料、編集して映像に仕上げる場合は別途有料です。具体的な範囲は、${ctx.offer_terms}`:ctx.offer==='consultation'?'今回お願いしている、撮影なしでご挨拶し、お話を伺うお時間に費用はかかりません。映像制作は有料ですが、今回お会いいただくこととは別です。制作をご希望の場合は、内容と見積りを事前にご相談いたします。':'費用や提供の範囲は、正確な条件を確認してからご案内いたします。';
    const tokens={intro,caller,host,offer,recipient:ctx.recipient||'代表者',person_intro:d?`${writer}がお届けしたお手紙に書いた内容について、ご連絡しました。`:`${writer}がしたためたお手紙に書いた内容について、ご連絡しました。`};
    let say=node.say.replace(/\{\{(\w+)\}\}/g,(m,k)=>tokens[k]||m);
    if(key==='start'&&d?.method==='recipient')say=say.replace(' ご本人へお渡しいただけたか分かりますでしょうか。',' 今、お取り次ぎをお願いできますでしょうか。');
    return {...node,say};
  }
  function validate(s){const errors=[];for(const[k,n]of Object.entries(s.nodes||{})){if(!n.title||!n.say)errors.push(k+':empty');for(const[,to]of n.options||[])if(to!=='record'&&!s.nodes[to])errors.push(k+':missing:'+to);}if(!s.nodes?.start)errors.push('missing:start');return errors;}
  root.LetterFollowup={VERSION,addMonths,body,ops,bundle,scripts,revisions,deliveries,currentLetter,day,realDay,digest,recipient,evidenceQuote,defaults,revision,nodes,build,payload,reviewed,script,delivery,changed,state,insert,recordDelivery,reasons,renderNode,validate};
  if(typeof module!=='undefined')module.exports=root.LetterFollowup;
})(typeof globalThis!=='undefined'?globalThis:this);
