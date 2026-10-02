import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { search, formatResults } from '../server/search.mjs';
import { init } from '../server/index.mjs';

const results = { results: [{ title: 'NASA', url: 'https://www.nasa.gov/', excerpts: ['An announcement.'] }] };
test('uses fixed Parallel endpoint and bounded Fast request; returns source text', async () => {
    const result = await search({ query: ' NASA ', budget: 2000 }, 'test-key', async (url, options) => {
        assert.equal(url, 'https://api.parallel.ai/v1/search');
        assert.equal(options.headers['x-api-key'], 'test-key');
        assert.equal(options.redirect, 'error');
        assert.deepEqual(JSON.parse(options.body), { search_queries: ['NASA'], mode: 'fast', max_chars_total: 2000, advanced_settings: { max_results: 10 } });
        return Response.json(results);
    });
    assert.deepEqual(result.links, ['https://www.nasa.gov/']);
    assert.match(result.text, /An announcement/);
});
for (const input of [null, {}, {query: ''}, {query: ' '.repeat(20)}, {query: 'a'.repeat(2001)}, {query: []}, ...[0,-1,20001,1.5,'20'].map(budget => ({query:'x',budget}))]) {
    test(`rejects invalid input ${JSON.stringify(input)?.slice(0,60)}`, async () => {
        await assert.rejects(search(input, 'key', () => assert.fail('must not call upstream')), { status: 400 });
    });
}
test('missing key fails before upstream call', async () => {
    await assert.rejects(search({query:'x'}, '', () => assert.fail()), {status:400});
});
for (const status of [401,402,403,429,500,302]) {
    test(`upstream ${status} is mapped without exposing response body`, async () => {
        await assert.rejects(search({query:'x'}, 'secret', async () => new Response('secret upstream details', {status})), error => {
            assert.equal(error.status, [401,402,403,429].includes(status) ? status : 502);
            assert.doesNotMatch(error.message, /secret/);
            return true;
        });
    });
}
test('timeout and malformed JSON become safe errors', async () => {
    await assert.rejects(search({query:'x'}, 'key', async () => {throw new DOMException('secret','TimeoutError');}), {status:504});
    await assert.rejects(search({query:'x'}, 'key', async () => new Response('not json')), {status:502});
    await assert.rejects(search({query:'x'}, 'key', async () => Response.json({})), {status:502});
});
test('budgets, deduplication, malformed records and unsafe links', () => {
    const data={results:[null,{url:'javascript:alert(1)'},{url:'https://user:pass@example.com'}, ...results.results, ...results.results, {url:'https://example.com/',title:'X',excerpts:['x'.repeat(5000),null]}]};
    for (const budget of [1,20,80,300,2000]) {
        const result=formatResults(data,budget);
        assert.ok(result.text.length<=budget);
        assert.equal(new Set(result.links).size,result.links.length);
        assert.ok(result.links.every(link=>link.startsWith('https://')&&!link.includes('@')));
    }
    assert.deepEqual(formatResults({results:[]},2000), {text:'',links:[],images:[]});
});
test('key endpoints isolate users, never return key, set restrictive permissions, and remove it', async () => {
    const root=await mkdtemp(path.join(tmpdir(),'parallel-plugin-test-'));
    const routes={};
    const router=Object.fromEntries(['get','post','delete'].map(method=>[method,(route,handler)=>{routes[`${method} ${route}`]=handler;}]));
    await init(router);
    async function call(route,body,userRoot=root) {
        let code=200,data;
        await routes[route]({body,user:userRoot ? {directories:{root:userRoot}} : undefined}, {status(n){code=n;return this;},json(value){data=value;}});
        return {code,data};
    }
    try {
        assert.equal((await call('get /status',null,null)).code,401);
        assert.equal((await call('get /status')).data.configured,false);
        assert.equal((await call('post /key',{key:'one\ntwo'})).code,400);
        assert.equal((await call('post /key',{key:'user-a-key'})).data.configured,true);
        assert.equal((await stat(path.join(root,'parallel-search-key.json'))).mode & 0o777,0o600);
        assert.equal(JSON.parse(await readFile(path.join(root,'parallel-search-key.json'),'utf8')).key,'user-a-key');
        assert.doesNotMatch(JSON.stringify(await call('get /status')),/user-a-key/);
        assert.equal((await call('get /status',null,path.join(root,'other-user'))).data.configured,false);
        assert.equal((await call('post /key',{key:'replacement'})).data.configured,true);
        assert.equal((await call('delete /key')).data.configured,false);
        assert.equal((await call('delete /key')).code,200);
        assert.equal((await call('post /search',{query:'hello'})).code,400);
    } finally {await rm(root,{recursive:true,force:true});}
});
