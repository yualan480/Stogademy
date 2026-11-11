import test from 'node:test';
import assert from 'node:assert/strict';
import {schoolSignupDetails,requireEmailConfirmation} from '../../chatter/school-signup.js';
test('school signup derives first initial and surname, ignoring numeric suffixes',()=>{
 for(const [email,name] of [[' 30yua@TESDK12.NET ','A Yu'],['30vuppalal2@tesdk12.net','L Vuppala']]){
  const d=schoolSignupDetails(email);assert.equal(d.metadata.full_name,name);assert.equal(d.metadata.name_source,'school_email');
 }
 assert.equal(schoolSignupDetails('30yua@tesdk12.net','Fake','Name').metadata.full_name,'A Yu');
});
test('school signup rejects other cohorts, personal addresses and malformed names',()=>{
 for(const email of ['a@gmail.com','29yua@tesdk12.net','31yua@tesdk12.net','30yua@tesdk12.net.evil.test','30a@tesdk12.net','30yu.a@tesdk12.net','30'+'a'.repeat(32)+'@tesdk12.net'])assert.throws(()=>schoolSignupDetails(email));
});
test('signup requires actual email confirmation configuration',async()=>{
 await requireEmailConfirmation('https://example.test','key',async()=>({ok:true,json:async()=>({mailer_autoconfirm:false})}));
 for(const settings of [{mailer_autoconfirm:true},{}])await assert.rejects(requireEmailConfirmation('https://example.test','key',async()=>({ok:true,json:async()=>settings})),/Confirm email/);
 await assert.rejects(requireEmailConfirmation('https://example.test','key',async()=>({ok:false})),/Could not check/);
});
