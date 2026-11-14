const test=require('node:test');
const assert=require('node:assert/strict');
const SO=require('../docs/sales-ops-core.js');
const today='2026-11-14';
function candidate(){
 const c={id:'test',company_name:'検証株式会社',address:'沖縄県那覇市泉崎1-1-1',postal_code:'900-0021',ceo_name:'検証 太郎',phone:'098-000-0000',source_data:{sales_ops:{eligibility:{status:'qualified'},relationship:{status:'unknown',checks:[]},contact:{phone_usable:false},fields:{},facts:[{status:'verified',source_kind:'official',source_url:'https://example.test/company',checked_at:today,text:'採用情報を公開している'}]}}};
 for(const key of ['company_name','address','postal_code','ceo_name','phone'])c.source_data.sales_ops.fields[key]={value:c[key],status:'verified',source_kind:'official',source_url:'https://example.test/company',excerpt:key+'の公式掲載',checked_at:today};
 return c;
}
test('verified qualified company is ready without invitation, relationship completion or prior mailing; facts remain unchanged',()=>{
 const c=candidate(),before=structuredClone(c);
 assert.deepEqual(SO.mailReasons(c,today),[]);assert.deepEqual(SO.phoneReasons(c,today),[]);
 assert.equal(SO.selected([c],300,today).length,1);assert.equal(SO.relation(c,today),false);
 assert.equal(SO.readinessNotes(c,today).length,1);assert.deepEqual(c,before);
 assert.doesNotMatch(SO.draft(c,'call',today),/お送りしました/);
 c.source_data.sales_ops.events=[{type:'flyer_sent'}];assert.match(SO.draft(c,'call',today),/お送りしました/);
});
test('missing/expired/mismatched/conflicting facts and unqualified criteria still prevent readiness',()=>{
 for(const change of [c=>delete c.source_data.sales_ops.fields.address,c=>c.source_data.sales_ops.fields.ceo_name.checked_at='2026-09-01',c=>c.phone='098-999-9999',c=>c.source_data.sales_ops.fields.phone.status='conflict',c=>c.source_data.sales_ops.eligibility.status='conditional']){
  const c=candidate();change(c);assert.ok(SO.phoneReasons(c,today).length);
 }
});
test('known stops and existing routes remain excluded even if all facts qualify',()=>{
 for(const change of [c=>c.excluded=true,c=>c.no_solicitation=true,c=>c.phase='declined',c=>c.phase='won',c=>c.source_data.sales_ops.duplicate_of='another',c=>c.source_data.sales_ops.relationship.status='existing',c=>c.source_data.sales_ops.relationship.status='blocked']){
  const c=candidate();change(c);assert.ok(SO.mailReasons(c,today).length);assert.ok(SO.phoneReasons(c,today).length);assert.equal(SO.selected([c],300,today).length,0);
 }
});
test('channel restrictions block only their medium and never become a blanket ban',()=>{
 const c=candidate(),op=c.source_data.sales_ops;
 op.channel_restrictions=[{status:'prohibited',channels:['email','form']}];assert.deepEqual(SO.mailReasons(c,today),[]);assert.deepEqual(SO.phoneReasons(c,today),[]);
 op.channel_restrictions=[{status:'prohibited',channel:'phone'}];assert.deepEqual(SO.mailReasons(c,today),[]);assert.ok(SO.phoneReasons(c,today).length);
 op.channel_restrictions=[{status:'prohibited',channel:'postal_mail'}];assert.ok(SO.mailReasons(c,today).length);assert.deepEqual(SO.phoneReasons(c,today),[]);
 op.channel_restrictions=[{status:'prohibited',channel:'all'}];assert.ok(SO.mailReasons(c,today).length);assert.ok(SO.phoneReasons(c,today).length);
 op.channel_restrictions=[];op.contact.phone_restriction={reason:'電話は不要と明示'};assert.ok(SO.phoneReasons(c,today).length);assert.deepEqual(SO.mailReasons(c,today),[]);
});
test('missing postal code prevents mailing but not a verified phone call',()=>{
 const c=candidate();delete c.postal_code;delete c.source_data.sales_ops.fields.postal_code;
 assert.ok(SO.mailReasons(c,today).length);assert.deepEqual(SO.phoneReasons(c,today),[]);
});
test('explicit dedicated windows and string-encoded phone restrictions are preserved; unknown permission is advisory',()=>{
 const c=candidate(),contact=c.source_data.sales_ops.contact;
 for(const purpose of ['通販購入者用','商品に関するお問い合わせ専用。平日9〜17時、経営宛営業には使用しない。','応募者専用','customer_only']){contact.phone_purpose=purpose;assert.ok(SO.phoneReasons(c,today).length);}
 contact.phone_purpose='代表電話。営業利用条件は未確認。';assert.deepEqual(SO.phoneReasons(c,today),[]);
 contact.phone_restriction=JSON.stringify({reason:'相手が電話不要と明示'});assert.ok(SO.phoneReasons(c,today).length);
 contact.phone_restriction=JSON.stringify({reason:'過去の制限',voided_at:today});assert.deepEqual(SO.phoneReasons(c,today),[]);
});
test('ready unmailed companies are available for calls; assignment plans preserve actual callers without mutating rows',()=>{
 const c=candidate();for(const f of Object.values(c.source_data.sales_ops.fields))f.checked_at=SO.jstDay();
 assert.equal(SO.callWork(c),true);const called=structuredClone(c);called.id='called';called.source_data.sales_ops.events=[{type:'call',by:'megu'}];called.source_data.sales_ops.call_owner='megu';
 const rows=[c,called],before=structuredClone(rows),plan=SO.assignmentPlan(rows,['hibiki'],()=>0);
 assert.deepEqual(plan.changes,[{id:'test',owner:'hibiki'}]);assert.deepEqual(plan.locked,[{id:'called',owner:'megu'}]);assert.deepEqual(rows,before);
 assert.deepEqual(SO.selected(rows,300).map(c=>c.id),['test']);assert.deepEqual(SO.phoneReasons(called),[]);
});
