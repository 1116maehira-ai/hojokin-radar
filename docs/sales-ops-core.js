(function(root){
  'use strict';
  const labels={company_name:'正式企業名',postal_code:'郵便番号',address:'郵送先住所',ceo_name:'代表者名',phone:'電話番号',website:'公式Web',established_date:'設立日',founding_date:'創業日',revenue:'売上・年度',own_recruit_url:'採用ページ'};
  const norm=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'').trim();
  const ops=c=>c.source_data?.sales_ops||{};
  const url=v=>{try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:null;}catch{return null;}};
  const day=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return null;const t=Date.parse(v+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v?t:null;};
  const jstDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  function fresh(d,max=30,now=jstDay()){const a=day(String(d||'').slice(0,10)),b=day(now);return a!==null&&b!==null&&b-a>=0&&b-a<=max*86400000;}
  function verified(c,k,now=jstDay()){const f=ops(c).fields?.[k];return !!(f&&f.status==='verified'&&['official','government'].includes(f.source_kind)&&url(f.source_url)&&f.excerpt&&norm(f.value)&&norm(f.value)===norm(c[k])&&fresh(f.checked_at,['ceo_name','phone'].includes(k)?30:90,now));}
  function entity(c){return ops(c).canonical_entity_key||c.corporate_number||c.source_data?.corporate_number||('name:'+norm(c.company_name).replace(/株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|\(有\)/g,''));}
  function blocked(c){return !!(c.excluded||c.no_solicitation||['declined','won'].includes(c.phase)||ops(c).duplicate_of);}
  function relation(c,now=jstDay()){const r=ops(c).relationship||{};return r.status==='clear'&&fresh(r.checked_at,30,now)&&Array.isArray(r.checks)&&['crm','gmail','source_history'].every(k=>r.checks.includes(k));}
  function mailReasons(c,now=jstDay()){
    const r=[];if(blocked(c))r.push('除外・停止・受注済・重複');
    for(const k of ['company_name','postal_code','address','ceo_name'])if(!verified(c,k,now))r.push(labels[k]+'の根拠未確認／期限切れ');
    if(!/^\d{3}-?\d{4}$/.test(norm(c.postal_code)))r.push('郵便番号不正');
    if(!relation(c,now))r.push('既存商流・拒否履歴の照合待ち');
    if(ops(c).eligibility?.status!=='qualified')r.push('地域・設立・売上の適格性確認待ち');
    return r;
  }
  function events(c){return (ops(c).events||[]).filter(e=>!e.voided_at);}
  function mailed(c){return !!c.source_data?.dm_mailed||events(c).some(e=>e.type==='flyer_sent');}
  function phoneReasons(c,now=jstDay()){const r=mailReasons(c,now);if(!verified(c,'phone',now))r.push('電話番号の根拠未確認／期限切れ');if(!mailed(c))r.push('チラシ発送実績なし');if(ops(c).contact?.phone_usable!==true)r.push('経営・総務への電話窓口と利用条件の確認待ち');return r;}
  function unique(rows){const seen=new Set;return rows.filter(c=>{const k=entity(c);if(seen.has(k))return false;seen.add(k);return true;});}
  function selected(rows,limit=300,now=jstDay()){return unique(rows.filter(c=>!mailReasons(c,now).length&&!mailed(c))).sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.company_name).localeCompare(String(b.company_name),'ja')).slice(0,limit);}
  function factOK(f,now=jstDay()){return f.status==='verified'&&['official','government'].includes(f.source_kind)&&url(f.source_url)&&f.text&&fresh(f.checked_at,90,now);}
  function draft(c,kind='letter',now=jstDay(),caller='前平'){
    if(!verified(c,'company_name',now)||!verified(c,'ceo_name',now))throw Error('企業名と代表者名の根拠を確認してください');
    const facts=(ops(c).facts||[]).filter(f=>factOK(f,now));if(!facts.length)throw Error('根拠付きの企業発信を一つ確認してください');
    const f=facts[0];
    if(kind==='call'&&phoneReasons(c,now).length)throw Error('宛先・電話・商流・実発送の確認が必要です');
    if(kind==='call')return `株式会社TENOHIRAの${caller}と申します。${c.ceo_name}様、または経営・総務のご担当者様はいらっしゃいますか。\n先日、企業の歩みを映像で残すご案内を郵送いたしました。${f.text}という御社の発信を拝見し、ご連絡しました。採用や社内での継承に映像を活用するご予定があるか、まずお話を伺えればと思っております。ご関心がありましたら、30分ほどお話しできる機会をいただけますでしょうか。`;
    return `${c.company_name}\n${c.ceo_name} 様\n\n突然のお便り、失礼いたします。沖縄で映像制作を行う株式会社TENOHIRAの前平雄一朗と申します。\n\n御社の公式発信を拝見し、${f.text}という点が心に残りました。大切にされている考えや現場の仕事を、社員の皆様の声とともに映像で残し、採用や社内の継承に生かすお手伝いができればと思い、お便りいたしました。\n\nまずは御社のお考えを伺いたく、30分ほどお話しする機会をいただけますと幸いです。\n\n株式会社TENOHIRA\n代表取締役 前平雄一朗`;
  }
  function monthly(rows,month){const out={flyer_sent:0,call:0,meeting_confirmed:0,meeting_held:0,letter_sent:0};for(const type of Object.keys(out)){const ids=new Set;for(const c of rows)for(const e of events(c)){const dt=type.startsWith('meeting_')?e.meeting_at:e.occurred_on;if(e.type===type&&String(dt||'').startsWith(month)&&(!type.startsWith('meeting_')||(e.accepted===true&&e.qualified===true&&e.meeting_id)))ids.add(type.startsWith('meeting_')?e.meeting_id:entity(c));}out[type]=ids.size;}return out;}
  // Phone ownership is based on actual calls, never on mailing or assignment.
  function callHistory(c){
    const out=events(c).filter(e=>e.type==='call');const seen=new Set(out.map(e=>e.id).filter(Boolean));
    for(const a of [c.source_data?.contact_log,c.history,c.logs,c.source_data?.history,c.source_data?.logs])
      if(Array.isArray(a))for(const e of a){const k=String(e.action||e.type||'');if(/^(tel_|call$)|電話実施|架電済/.test(k)&&!seen.has(e.event_id||e.id))out.push(e);}
    return out.sort((a,b)=>String(a.recorded_at||a.occurred_on||a.date||'').localeCompare(String(b.recorded_at||b.occurred_on||b.date||'')));
  }
  function called(c){return !!c.last_called_at||callHistory(c).length>0||['contacted','pending_callback'].includes(c.phase);}
  function assignee(c){return ops(c).call_owner||(called(c)?callHistory(c).map(e=>e.by||e.user||e.actor||e.assignee).find(Boolean):'')||c.source_data?.call_assignee||'';}
  function callOwner(c){if(!called(c))return '';return ops(c).call_owner||callHistory(c).map(e=>e.by||e.user||e.actor||e.assignee).find(Boolean)||assignee(c)||'';}
  function callWork(c){return mailed(c)&&!blocked(c)&&!['existing','blocked'].includes(ops(c).relationship?.status);}
  function nextCall(c){if(!callWork(c))return false;if(!called(c))return true;return ['absent','callback','interested'].includes(ops(c).call_result?.outcome)||c.phase==='pending_callback';}
  function shuffled(a,rng=Math.random){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function assignmentPlan(rows,members,rng=Math.random){
    members=[...new Set(members.map(x=>String(x).trim()).filter(Boolean))];if(!members.length)throw Error('電話担当を1人以上選んでください');
    const counts=Object.fromEntries(members.map(n=>[n,0])),changes=[],locked=[];
    for(const c of rows.filter(callWork)){if(called(c)){const owner=callOwner(c);locked.push({id:c.id,owner});if(owner in counts)counts[owner]++;}}
    for(const c of shuffled(rows.filter(c=>callWork(c)&&!called(c)),rng)){
      const least=Math.min(...Object.values(counts)),choices=members.filter(n=>counts[n]===least),owner=choices[Math.floor(rng()*choices.length)];counts[owner]++;
      changes.push({id:c.id,owner});
    }
    return {changes,locked,counts};
  }
  function selection(c){return ops(c).mail_selection||null;}
  function prepared(c){return events(c).some(e=>e.type==='flyer_prepared')&&!mailed(c);}
  function shortlist(rows,limit=300,now=jstDay()){
    const cities=['那覇','豊見城','糸満','宜野湾','浦添','沖縄市'];
    return unique(rows.filter(c=>!blocked(c)&&!mailed(c)&&!selection(c)&&!prepared(c)&&!called(c)&&!['existing','blocked'].includes(ops(c).relationship?.status)&&cities.some(x=>String(c.city||c.address||'').includes(x))))
      .sort((a,b)=>(mailReasons(a,now).length?1:0)-(mailReasons(b,now).length?1:0)||(b.priority||0)-(a.priority||0)||String(a.company_name).localeCompare(String(b.company_name),'ja')).slice(0,limit);
  }
  const api={labels,norm,ops,url,day,jstDay,fresh,verified,entity,blocked,relation,mailReasons,phoneReasons,events,mailed,unique,selected,factOK,draft,monthly,callHistory,called,assignee,callOwner,callWork,nextCall,shuffled,assignmentPlan,selection,prepared,shortlist};
  root.SalesOps=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
