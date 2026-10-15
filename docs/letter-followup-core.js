(function(root){
  'use strict';
  const VERSION='20261016-letter-followup-v1';
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
  const uid=()=>root.crypto.randomUUID();
  async function digest(s){const a=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(a),v=>v.toString(16).padStart(2,'0')).join('');}
  function recipient(text,c){const line=body(text).split('\n').slice(0,7).find(l=>/様\s*$/.test(l));return line?line.replace(/様\s*$/,'').trim():String(c.ceo_name||'');}
  function evidenceQuote(text){const p=body(text).split(/\n\s*\n/).map(x=>x.trim());return p.find(x=>/拝見|拝読|心に残|共感|理念|御社が|大城様が/.test(x)&&!/^突然/.test(x))||'';}
  function defaults(c,letter=currentLetter(c)){
    const text=body(letter.body),quote=evidenceQuote(text);
    return {recipient:recipient(text,c),interest:quote,question:'会社として大切にされてきた考えや、これからの世代にも残したいことについて、お聞かせいただけますでしょうか。',evidence_quote:quote,offer:'consultation',offer_terms:'',author:'前平雄一朗'};
  }
  async function revision(c,letter,by){
    const text=body(letter.body);if(!text)throw Error('先に手紙本文を共有保存してください');
    const hash=await digest(String(c.id)+'\n'+text);
    return {id:'letter-'+hash.slice(0,24),hash,body:text,company_name:c.company_name,recipient:recipient(text,c),letter_saved_at:letter.saved_at||null,captured_at:new Date().toISOString(),by};
  }
  function nodes(ctx){
    const interest=ctx.interest.trim(),question=ctx.question.trim();
    const n=(title,say,options,note='')=>({title,say,options,note});
    return {
      start:n('① 受付の方へ','{{intro}} ご本人へお渡しいただけたか分かりますでしょうか。',[['本人へ渡っている','purpose'],['まだ渡っていない・分からない','unseen'],['どんな用件？','purpose'],['担当者につながった','person'],['代表者が不在','absent'],['今は忙しい','busy'],['不要・営業お断り','declined']],'受付での受領と本人の受領・閲覧を分けます。'),
      purpose:n('② 手紙を書いた理由','弊社は企業の歩みや想いを映像で伝える仕事をしております。お手紙では、'+interest+'という点への関心をお伝えしました。まずは、そのお考えについて直接お話を伺う機会をご相談したく、ご連絡しました。',[['つないでもらえた','person'],['社長へ伝えておきます','relay'],['代表者は不在','absent'],['費用は？','price'],['不要','declined']]),
      unseen:n('手紙が本人へ渡ったか不明','承知いたしました。ご覧いただいた前提でお話ししてしまわないよう、まず確認させていただきました。差し支えなければ、お手紙にお目通しいただけるようお伝えいただけますでしょうか。',[['用件を聞かれた','purpose'],['社長へ伝えておく','relay'],['再連絡してよい','callback'],['今回は終了','end'],['不要','declined']]),
      person:n('③ ご本人または担当者につながった','お時間をいただきありがとうございます。株式会社TENOHIRAの{{caller}}と申します。{{person_intro}} 今、1分ほどお話ししてもよろしいでしょうか。',[['話してよい','listen'],['手紙を見ていない','unseen'],['今は忙しい','busy'],['不要','declined']]),
      listen:n('④ 手紙に沿ってお話を伺う','お手紙に書かせていただいた、'+interest+'という点が心に残りました。'+question,[['お話ししてくれた','invite'],['今は動画を考えていない','notnow'],['インタビューが苦手','camera'],['無料ですか？','price'],['不要','declined']],'一度に質問を重ねず、相手の回答を聞きます。'),
      invite:n('⑤ 面会をお願いする','お聞かせいただきありがとうございます。今のお話をもう少し詳しく伺い、必要であれば映像でお手伝いできることもご一緒に考えられればと思います。まずは30分ほど、{{host}}がお話を伺う機会をいただけますでしょうか。',[['会ってもよい','date'],['今は忙しい','busy'],['費用を聞かれた','price'],['今回は見送り','end']]),
      absent:n('代表者が不在','承知いたしました。会社の発信や人材育成をご担当の方に、お話を伺うことは可能でしょうか。お取次ぎが難しければ、改めてご連絡しても差し支えないかだけ伺えますでしょうか。',[['担当者につながった','person'],['再連絡してよい','callback'],['伝えておく','relay'],['取り次げない','end'],['営業お断り','declined']],'代表者本人にしか伺えない内容は、担当者に回答を求めません。'),
      notnow:n('今は動画を考えていない','承知いたしました。現時点では制作をお考えでないということですね。お聞かせいただきありがとうございます。',[['相手が会話を続けてくれる','greeting'],['今回は不要とのこと','end'],['今後も営業不要','declined']],'お断りの後に、採用や事業承継の価値を重ねて説明しません。'),
      greeting:n('話を伺う機会だけ相談する','今すぐ制作を決めていただくお願いではなく、お手紙に書いたお考えについて、まずご挨拶を兼ねてお話を伺いたかったのですが、そのような機会も今は難しいでしょうか。',[['挨拶ならよい','date'],['今は難しい','end'],['営業不要','declined']],'相手が会話を続ける場合に一度だけ。再度断られたら終了します。'),
      camera:n('インタビューが苦手','承知いたしました。撮影を伴わず、まずご挨拶としてお話を伺う形も可能ですが、そのような面会もご負担でしょうか。',[['撮影なしなら話せる','date'],['無料か知りたい','price'],['今回は不要','end']],'撮影なしの面会を実際に提供できる場合のみ使用。撮影の了承とは別です。'),
      price:n('無料と有料について','{{offer}}',[['相談したい','date'],['条件を確認して連絡','callback_permission'],['今回は見送り','end']],'この手紙にない無料撮影を勝手に追加しません。'),
      relay:n('社長へ伝えておきます','ありがとうございます。お手紙に書いたお考えについてお話を伺いたいことと、映像制作のご案内を含むことをお伝えいただけますと幸いです。後日、こちらから改めてご連絡しても差し支えないでしょうか。',[['再連絡してよい','callback'],['関心があれば先方から連絡','end'],['今回は終了','end']],'伝言を受けてもらったことを面会の承諾として記録しません。'),
      busy:n('今は忙しい','お忙しいところ失礼いたしました。改めてご連絡しても差し支えないでしょうか。',[['了承された','callback'],['今回は不要','end'],['今後も連絡不要','declined']]),
      callback_permission:n('確認後のご連絡','正確な条件を確認してからご案内いたします。改めてご連絡しても差し支えないでしょうか。',[['連絡してよい','callback'],['不要','end']]),
      callback:n('了承された再連絡','ありがとうございます。ご都合のよい曜日や時間帯を伺えますでしょうか。本日はお時間をいただき、ありがとうございました。',[['電話結果を記録','record']],'了承された時期と内容だけを人が記録します。'),
      date:n('⑥ 日程のご相談','ありがとうございます。まずお話を伺う面会として、撮影の有無と、訪問・オンラインのご希望を確認させてください。ご都合のよい曜日と時間帯を伺い、最新の予定を確認してから調整いたします。',[['希望を聞けた','finish'],['後日連絡する','callback_permission']],'無料撮影への了承と、有料制作を検討する適格商談は区別します。日時の確定は実際の承諾後です。'),
      declined:n('不要とおっしゃった場合','承知いたしました。お忙しいところ、ご対応いただきありがとうございました。失礼いたします。',[['電話結果を記録','record']],'説得を続けず終了。今回は不要か、今後の営業停止か、実際の返答の範囲を記録します。'),
      end:n('丁寧に終了','承知いたしました。本日はお時間をいただき、ありがとうございました。失礼いたします。',[['電話結果を記録','record']]),
      finish:n('希望を伺って終了','本日はお話をお聞かせいただき、ありがとうございました。伺ったご希望に合わせ、予定を確認してから改めてご連絡いたします。',[['電話結果を記録','record']],'希望を聞いただけでは予約確定ではありません。')
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
    const node=s.nodes[key];if(!node)return null;
    const d=delivery(c,s),ctx=s.context,author=ctx.author||'前平雄一朗';
    const self=/前平|MAGE/i.test(caller),host=self?'私':'弊社代表の前平';
    const writer=self?'私':`弊社の${author}`;
    let intro='株式会社TENOHIRAの'+caller+'と申します。お届け記録が未確認のため、この冒頭はまだ使用できません。';
    if(d){const who=d.delivered_by===caller?'私':`弊社の${d.delivered_by}`;const name=ctx.recipient+'様';const lead=`株式会社TENOHIRAの${caller}と申します。${d.occurred_on}に${who}が${name}宛てのお手紙を`;
      intro=lead+({deposited:'直接お届けし、受付の方にお預かりいただいた件でお電話しました。',recipient:'直接お渡しした件でお電話しました。',staff:'お届けし、ご担当の方にお預かりいただいた件でお電話しました。',post:'お送りした件でお電話しました。'}[d.method]);
    }
    const offer=ctx.offer==='raw_interview'?`今回追加でご案内する条件として、インタビューの撮影と編集・加工をしないデータのお渡しは無料、編集して映像に仕上げる場合は別途有料です。具体的な範囲は、${ctx.offer_terms}`:ctx.offer==='consultation'?'最初の30分のお話・ご相談は無料です。映像制作は有料で、企業ストーリーは税別50万円定額、周年向けは税別70〜100万円、内容を広げたプランは税別100〜150万円が目安です。内容に合わせてお見積りをご確認いただきます。':'費用や提供の範囲は、正確な条件を確認してからご案内いたします。';
    const tokens={intro,caller,host,offer,person_intro:d?`${writer}がお届けしたお手紙に書いた内容について、ご連絡しました。`:'手紙のお届けが未確認のため、このセリフは下書きです。'};
    let say=node.say.replace(/\{\{(\w+)\}\}/g,(m,k)=>tokens[k]||m);
    if(key==='start'&&d?.method==='recipient')say=say.replace(' ご本人へお渡しいただけたか分かりますでしょうか。',' 今、お取り次ぎをお願いできますでしょうか。');
    return {...node,say};
  }
  function validate(s){const errors=[];for(const[k,n]of Object.entries(s.nodes||{})){if(!n.title||!n.say)errors.push(k+':empty');for(const[,to]of n.options||[])if(to!=='record'&&!s.nodes[to])errors.push(k+':missing:'+to);}if(!s.nodes?.start)errors.push('missing:start');return errors;}
  root.LetterFollowup={VERSION,body,ops,bundle,scripts,revisions,deliveries,currentLetter,day,realDay,digest,recipient,evidenceQuote,defaults,revision,nodes,build,payload,reviewed,script,delivery,changed,state,insert,recordDelivery,reasons,renderNode,validate};
  if(typeof module!=='undefined')module.exports=root.LetterFollowup;
})(typeof globalThis!=='undefined'?globalThis:this);
