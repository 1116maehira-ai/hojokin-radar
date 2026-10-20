const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');

test('published HTML requests the exact POST save implementation, invalidating cached older code',()=>{
 const html=fs.readFileSync('docs/attack-list.html','utf8');
 const source=fs.readFileSync('docs/sales-ops.js');
 const version='save-post-'+crypto.createHash('sha256').update(source).digest('hex').slice(0,16);
 assert.ok(html.includes(`src="sales-ops.js?v=${version}"`),'Change the HTML script version whenever the save implementation changes');
 assert.match(source.toString(),/sb\.rpc\('sales_ops_save_company_v1'/);
 assert.doesNotMatch(source.toString(),/\.eq\(['"]source_data['"]/,'Never send the whole company JSON in a URL');
});

test('CAS conflicts return HTTP 409 without triggering PostgREST serialization retries',()=>{
 const sql=fs.readFileSync('sql/sales_ops_save_company.sql','utf8');
 assert.match(sql,/raise sqlstate 'PT409'/);
 assert.doesNotMatch(sql,/errcode\s*=\s*'40001'/);
});
