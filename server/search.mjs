export class SearchError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export function validateInput(input) {
    const { query, budget = 2000 } = input ?? {};
    if (typeof query !== 'string' || !query.trim() || query.length > 2000
        || !Number.isInteger(budget) || budget < 1 || budget > 20000) {
        throw new SearchError(400, 'Enter a query of 1–2000 characters and a budget of 1–20000.');
    }
    return { query: query.trim(), budget };
}

export function formatResults(data, budget) {
    if (!Array.isArray(data?.results)) throw new SearchError(502, 'Invalid Parallel response.');
    const blocks = [];
    const links = [];
    let remaining = budget;
    for (const item of data.results) {
        let url;
        try { url = new URL(item?.url); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || links.includes(url.href)) continue;
        const title = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : '';
        const header = `${title ? title + '\n' : ''}${url.href}\n`;
        const separator = blocks.length ? 2 : 0;
        if (header.length + separator > remaining) continue;
        const excerpts = Array.isArray(item.excerpts) ? item.excerpts.filter(x => typeof x === 'string').join('\n') : '';
        const block = (header + excerpts.slice(0, remaining - header.length - separator)).trimEnd();
        blocks.push(block);
        links.push(url.href);
        remaining -= block.length + separator;
    }
    return { text: blocks.join('\n\n'), links, images: [] };
}

export async function search(input, key, fetchImpl = fetch) {
    const { query, budget } = validateInput(input);
    if (!key) throw new SearchError(400, 'Set your Parallel API key in Extensions → Parallel Search.');
    try {
        const response = await fetchImpl('https://api.parallel.ai/v1/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': key },
            body: JSON.stringify({ search_queries: [query], mode: 'fast', max_chars_total: budget, advanced_settings: { max_results: 10 } }),
            signal: AbortSignal.timeout(15000),
            redirect: 'error',
        });
        if (!response.ok) {
            const messages = { 401: 'Check your Parallel API key.', 402: 'Your Parallel account has insufficient credits.', 429: 'Parallel rate limit reached. Try again later.' };
            const status = [400, 401, 402, 403, 429].includes(response.status) ? response.status : 502;
            throw new SearchError(status, messages[status] || 'Parallel search failed. Try again later.');
        }
        return formatResults(await response.json(), budget);
    } catch (error) {
        if (error instanceof SearchError) throw error;
        const timeout = ['AbortError', 'TimeoutError'].includes(error?.name);
        throw new SearchError(timeout ? 504 : 502, timeout ? 'Parallel search timed out.' : 'Parallel search request failed.');
    }
}
