const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const SO=require('../docs/sales-ops-core.js');
function company(id,mailed=false){return {id,company_name:'テスト法人'+id,phase:'declined',no_solicitation:true,next_date:'2026-12-01',source_data:{call_assignee:'hibiki',contact_log:[{note:'保持'}],sales_ops:{relationship:{status:'blocked'},contact:{phone_usable:false},mail_selection:{batch_id:'NOV',selected_on:'2026-11-01'},call_owner:'hibiki',call_result:{outcome:'declined'},letter:{body:'保持'},audit:[{note:'既存'}],events:mailed?[{id:'old-'+id,type:'flyer_sent',occurred_on:'2026-09-30',batch_id:'SEP'}]:[]}}};}
function harness(rows){
 let db=structuredClone(rows),calls=0,fail=false,readbackMissing=false;const messages=[],els=new Map();
 const element=id=>{if(!els.has(id))els.set(id,{value:'',checked:false,innerHTML:'',style:{},scrollIntoView(){},insertAdjacentHTML(){},setAttribute(){}});return els.get(id);};
 const ctx={SalesOps:SO,currentUser:null,cos:[],cur:null,URL,Intl,Date,structuredClone,crypto:require('node:crypto').webcrypto,
  renderTab(){},renderList(){},getRows(){return ctx.cos;},getLetter(){return {};},sayText(x){return x;},
  document:{getElementById:element,querySelectorAll(){return [];}},sessionStorage:{getItem(){return null;}},
  can(){return true;},toast(x){messages.push(x);},confirm(){return true;},activeFlt:new Set(),curF:'all',curSeg:'all',
  switchTab(){},saveLetter(){},exportDmCsv(){},autoSelectNext300(){},markVerified(){},quickEditSave(){},markDmReady(){},markDmMailed(){},bulkMarkDmMailed(){},
  sb:{from(){return {select(){return this;},order(){return this;},async range(){return {data:structuredClone(db),error:null};}};},
   async rpc(name,{p_changes}){calls++;if(fail)return {error:{message:'競合'},data:null};assert.equal(name,'sales_ops_apply_batch_v1');for(const c of p_changes){const row=db.find(r=>r.id===c.id);assert.deepEqual(c.expected_source,row.source_data);row.source_data=structuredClone(c.source_data);}if(readbackMissing)db.forEach(c=>c.source_data.sales_ops.events=[]);return {data:p_changes.length,error:null};}}
 };
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../docs/sales-ops.js'),'utf8'),ctx);
 ctx.currentUser={name:'mage'};ctx.cos=structuredClone(db);
 const run=s=>vm.runInContext(s,ctx);
 run("renderList=function(){}; SO.jstDay=()=> '2026-11-14';");
 function dialog(type='flyer_sent'){run("soPicked.clear(); for(const c of cos)soPicked.add(c.id);");ctx.soBatchDialog(type);element('so-bulk-date').value='2026-11-13';element('so-bulk-batch').value='NOV';element('so-bulk-confirm').checked=true;}
 return {ctx,run,dialog,element,messages,get db(){return db;},get calls(){return calls;},set fail(v){fail=v;},set readbackMissing(v){readbackMissing=v;}};
}
test('actual shipment works despite pending/stopped research, preserving human records; preparation stays blocked',async()=>{
 const before=company('1'),h=harness([before]);h.dialog('flyer_prepared');assert.match(h.element('so-batch-editor').innerHTML,/disabled/);
 await h.ctx.soSaveBatch('flyer_prepared');assert.equal(h.calls,0);
 h.dialog();assert.doesNotMatch(h.element('so-batch-editor').innerHTML,/ disabled/);await h.ctx.soSaveBatch('flyer_sent');
 assert.equal(h.calls,1);const after=h.db[0];assert.equal(after.phase,before.phase);assert.equal(after.no_solicitation,true);assert.equal(after.next_date,before.next_date);
 for(const k of ['call_owner','call_result','letter','relationship','contact','mail_selection'])assert.deepEqual(after.source_data.sales_ops[k],before.source_data.sales_ops[k]);
 assert.equal(after.source_data.call_assignee,'hibiki');assert.deepEqual(after.source_data.contact_log,before.source_data.contact_log);
 assert.equal(after.source_data.sales_ops.audit.length,2);assert.equal(after.source_data.sales_ops.events[0].occurred_on,'2026-11-13');
 assert.ok(SO.phoneReasons(after).length);assert.match(h.messages.at(-1),/読み戻して確認/);
});
test('partial shipment and retry do not duplicate existing records',async()=>{
 const h=harness([company('1',true),company('2')]);h.dialog();await h.ctx.soSaveBatch('flyer_sent');
 assert.equal(h.db[0].source_data.sales_ops.events.length,1);assert.equal(h.db[1].source_data.sales_ops.events.length,1);
 h.dialog();await h.ctx.soSaveBatch('flyer_sent');assert.equal(h.calls,1);assert.match(h.messages.at(-1),/二重登録/);
});
test('missing checkbox, future date and impossible date cannot save',async()=>{
 for(const [date,check] of [['2026-11-15',true],['2026-02-30',true],['2026-11-13',false],['',true]]){
  const h=harness([company('1')]);h.dialog();h.element('so-bulk-date').value=date;h.element('so-bulk-confirm').checked=check;await h.ctx.soSaveBatch('flyer_sent');assert.equal(h.calls,0);
 }
});
test('API error preserves input and never claims success',async()=>{
 const h=harness([company('1')]);h.dialog();h.fail=true;await h.ctx.soSaveBatch('flyer_sent');
 assert.equal(h.db[0].source_data.sales_ops.events.length,0);assert.equal(h.element('so-bulk-date').value,'2026-11-13');assert.match(h.messages.at(-1),/保存できません/);
});
test('missing readback does not claim verified success',async()=>{
 const h=harness([company('1')]);h.dialog();h.readbackMissing=true;await h.ctx.soSaveBatch('flyer_sent');assert.match(h.messages.at(-1),/確認が完了していません/);
});
test('month history distinguishes selection month from shipment month, and ignores voided events',()=>{
 const c=company('1',true);c.source_data.sales_ops.events.push({type:'flyer_sent',occurred_on:'2026-10-30',batch_id:'OCT',voided_at:'2026-11-01'});
 const h=harness([c]);const groups=h.ctx.soMailGroups();assert.equal(groups.length,2);
 assert.equal(h.ctx.soMailBatchMatches(c,{kind:'selection',batch:'NOV',date:'2026-11-01'}),true);
 assert.equal(h.ctx.soMailBatchMatches(c,{kind:'sent',batch:'SEP',date:'2026-09-30'}),true);
 assert.equal(h.ctx.soMailBatchMatches(c,{kind:'sent',batch:'OCT',date:'2026-10-30'}),false);
 h.element('so-mail-history-month').value='2026-11';const html=h.ctx.soMailHistoryHTML();assert.match(html,/2026-11-01 選定/);assert.doesNotMatch(html,/2026-09-30 発送済み/);
});
test('history escapes batch names and company names',()=>{
 const c=company('1');c.company_name='<script>alert(1)</script>';c.source_data.sales_ops.mail_selection.batch_id='"><script>';
 const h=harness([c]);assert.doesNotMatch(h.ctx.soMailHistoryHTML(),/<script>/);h.dialog();assert.doesNotMatch(h.element('so-batch-editor').innerHTML,/<script>/);
});

test('qualified verified selection can export and prepare without a second manual review; advisory history remains',async()=>{
 const c=company('ready');delete c.phase;delete c.no_solicitation;
 Object.assign(c,{company_name:'検証株式会社',address:'沖縄県那覇市泉崎1-1-1',postal_code:'900-0021',ceo_name:'検証 太郎',phone:'098-000-0000'});
 const op=c.source_data.sales_ops;op.relationship={status:'unknown'};op.eligibility={status:'qualified'};op.fields={};op.call_result=null;
 for(const k of ['company_name','address','postal_code','ceo_name','phone'])op.fields[k]={status:'verified',value:c[k],checked_at:'2026-11-14',source_kind:'official',source_url:'https://example.test/company',excerpt:'公式会社概要'};
 const h=harness([c]);assert.equal(h.ctx.soMailDoubleChecked(c),false);assert.equal(h.ctx.soBatchIssues(c).length,0);
 const gate=h.ctx.soGateHTML(c,true);assert.match(gate,/確認済み/);assert.match(gate,/照合は未完了/);assert.match(gate,/先行郵送は必須ではありません/);
 h.run('soDownload=function(){globalThis.exported=true;};');h.ctx.soAddressCsv([c]);assert.equal(h.ctx.exported,true);
 h.dialog('flyer_prepared');assert.doesNotMatch(h.element('so-batch-editor').innerHTML,/ disabled/);await h.ctx.soSaveBatch('flyer_prepared');assert.equal(h.calls,1);
 assert.equal(h.db[0].source_data.sales_ops.events.at(-1).type,'flyer_prepared');assert.equal(h.db[0].source_data.sales_ops.relationship.status,'unknown');assert.equal(h.db[0].source_data.sales_ops.contact.phone_usable,false);
 const nodes=h.ctx.soLeafletNodes(c,'前平');assert.doesNotMatch(nodes.start.say,/お送りした/);assert.ok(!nodes.start.options.some(x=>x[1]==='unseen'));
});

