import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SearchError, search, validateInput } from './search.mjs';

export const info = {
    id: 'parallel-search',
    name: 'Parallel Search',
    description: 'Third-party Parallel Search integration maintained by Rowan Aldean (Parallel Web Systems).',
};

function keyPath(request) {
    const root = request.user?.directories?.root;
    if (typeof root !== 'string' || !root) throw new SearchError(401, 'Sign in to SillyTavern first.');
    return path.join(root, 'parallel-search-key.json');
}

async function readKey(file) {
    try { return JSON.parse(await readFile(file, 'utf8')).key || ''; }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

export async function init(router) {
    const route = handler => async (request, response) => {
        try { await handler(request, response, keyPath(request)); }
        catch (error) {
            response.status(error instanceof SearchError ? error.status : 500)
                .json({ error: error instanceof SearchError ? error.message : 'Parallel Search could not complete the request.' });
        }
    };
    router.get('/status', route(async (_request, response, file) => {
        response.json({ version: '0.1.0', configured: Boolean(await readKey(file)) });
    }));
    router.post('/key', route(async (request, response, file) => {
        const key = request.body?.key;
        if (typeof key !== 'string' || !key.trim() || key.length > 4096 || /[\r\n]/.test(key)) {
            throw new SearchError(400, 'Enter a valid API key.');
        }
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, JSON.stringify({ key: key.trim() }), { mode: 0o600, flag: 'wx' });
            await rename(temporary, file);
        } finally { await unlink(temporary).catch(() => {}); }
        response.json({ configured: true });
    }));
    router.delete('/key', route(async (_request, response, file) => {
        await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
        response.json({ configured: false });
    }));
    router.post('/search', route(async (request, response, file) => {
        validateInput(request.body);
        response.json(await search(request.body, await readKey(file)));
    }));
}
