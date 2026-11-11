import test from 'node:test';
import assert from 'node:assert/strict';
import {schoolSignupDetails,requireEmailConfirmation} from '../../chatter/school-signup.js';
test('school signup preserves supplied international names and normalizes email',()=>{
 const d=schoolSignupDetails(' 30yua@TESDK12.NET ',' Ana  María ','O’Neil');
 assert.equal(d.email,'30yua@tesdk12.net');assert.equal(d.metadata.full_name,'Ana María O’Neil');assert.equal(d.metadata.name_source,'self_reported');
});
test('school signup rejects missing names, markup, personal email and oversized names',()=>{
 for(const args of [['30yua@tesdk12.net','','Yu'],['30yua@tesdk12.net','<script>','Yu'],['a@gmail.com','Alan','Yu'],['29yua@tesdk12.net','Alan','Yu'],['31yua@tesdk12.net','Alan','Yu'],['30yua@tesdk12.net.evil.test','Alan','Yu'],['30yua@tesdk12.net','A'.repeat(21),'Yu']])assert.throws(()=>schoolSignupDetails(...args));
});
test('signup requires actual email confirmation configuration',async()=>{
 await requireEmailConfirmation('https://example.test','key',async()=>({ok:true,json:async()=>({mailer_autoconfirm:false})}));
 for(const settings of [{mailer_autoconfirm:true},{}])await assert.rejects(requireEmailConfirmation('https://example.test','key',async()=>({ok:true,json:async()=>settings})),/Confirm email/);
 await assert.rejects(requireEmailConfirmation('https://example.test','key',async()=>({ok:false})),/Could not check/);
});
