import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticate} from '../server/auth.js';
test('verified profile first and last names replace usernames',async t=>{
 let profileURL='';t.mock.method(globalThis,'fetch',async url=>{if(url.endsWith('/auth/v1/user'))return Response.json({id:'verified-player'});profileURL=url;return Response.json([{username:'ada123',display_name:'Customized Alias',first_name:' Ada ',last_name:'  Lovelace '}]);});
 const identity=await authenticate('verified-token');assert.equal(identity.id,'verified-player');assert.equal(identity.name,'Ada Lovelace');assert.ok(profileURL.includes('first_name,last_name'));
});
test('legacy full display names are usable but missing names never reveal the username',async t=>{
 let row={username:'secret-handle',display_name:'Alan Turing'};t.mock.method(globalThis,'fetch',async url=>Response.json(url.endsWith('/auth/v1/user')?{id:'verified-player'}:[row]));assert.equal((await authenticate('token')).name,'Alan Turing');row={username:'secret-handle',display_name:'secret-handle'};assert.equal((await authenticate('token')).name,'Player');
});
