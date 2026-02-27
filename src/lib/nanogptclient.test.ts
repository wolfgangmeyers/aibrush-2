import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NanoGPTClient, NANOGPT_BASE_URL } from './nanogptclient';

function makeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (key: string) => headers[key.toLowerCase()] ?? null,
        },
        json: () => Promise.resolve(body),
    });
}

describe('NanoGPTClient', () => {
    let client: NanoGPTClient;

    beforeEach(() => {
        client = new NanoGPTClient('test-api-key');
    });

    describe('generateImage', () => {
        it('returns parsed response on success', async () => {
            const mockResponse = {
                created: 1234567890,
                data: [{ b64_json: 'abc123' }],
                cost: 0.04,
                paymentSource: 'balance',
                remainingBalance: 9.96,
            };
            vi.stubGlobal('fetch', makeFetch(200, mockResponse));

            const result = await client.generateImage({ model: 'hidream', prompt: 'test' });

            expect(result.data).toHaveLength(1);
            expect(result.data[0].b64_json).toBe('abc123');
            expect(result.cost).toBe(0.04);

            const [url, opts] = (fetch as any).mock.calls[0];
            expect(url).toBe(`${NANOGPT_BASE_URL}/images/generations`);
            expect(JSON.parse((opts as RequestInit).body as string)).toMatchObject({
                model: 'hidream',
                prompt: 'test',
            });
            expect((opts as RequestInit).headers).toMatchObject({
                Authorization: 'Bearer test-api-key',
            });
        });

        it('throws rate limit error with Retry-After on 429', async () => {
            vi.stubGlobal('fetch', makeFetch(429, { error: { message: 'rate limited' } }, { 'retry-after': '30' }));

            await expect(client.generateImage({ model: 'hidream', prompt: 'test' })).rejects.toThrow(
                'Rate limit exceeded. Retry after 30s.'
            );
        });

        it('throws rate limit error without Retry-After when header absent', async () => {
            vi.stubGlobal('fetch', makeFetch(429, {}));

            await expect(client.generateImage({ model: 'hidream', prompt: 'test' })).rejects.toThrow(
                'Rate limit exceeded.'
            );
        });

        it('throws API error message from response body on non-429 error', async () => {
            vi.stubGlobal('fetch', makeFetch(500, { error: { message: 'Internal server error' } }));

            await expect(client.generateImage({ model: 'hidream', prompt: 'test' })).rejects.toThrow(
                'Internal server error'
            );
        });

        it('uses fallback status message when error body is unparseable', async () => {
            vi.stubGlobal('fetch', {
                ...makeFetch(503, null),
            } as any);
            // Override json to throw
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                headers: { get: () => null },
                json: () => Promise.reject(new Error('not json')),
            }));

            await expect(client.generateImage({ model: 'hidream', prompt: 'test' })).rejects.toThrow(
                'NanoGPT API error: 503'
            );
        });

        it('throws network/CORS error on fetch failure', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

            await expect(client.generateImage({ model: 'hidream', prompt: 'test' })).rejects.toThrow(
                'NanoGPT request failed'
            );
        });
    });

    describe('listImageModels', () => {
        it('returns array response as-is', async () => {
            const models = [{ id: 'hidream' }, { id: 'flux-pro' }];
            vi.stubGlobal('fetch', makeFetch(200, models));

            const result = await client.listImageModels();
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('hidream');
        });

        it('normalises object response (keys → values)', async () => {
            const modelsObj = { hidream: { id: 'hidream' }, 'flux-pro': { id: 'flux-pro' } };
            vi.stubGlobal('fetch', makeFetch(200, modelsObj));

            const result = await client.listImageModels();
            expect(result).toHaveLength(2);
            expect(result.map((m: any) => m.id)).toContain('hidream');
        });

        it('throws on network error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')));

            await expect(client.listImageModels()).rejects.toThrow('Failed to fetch NanoGPT models');
        });

        it('throws on non-ok response', async () => {
            vi.stubGlobal('fetch', makeFetch(401, { error: 'unauthorized' }));

            await expect(client.listImageModels()).rejects.toThrow('Failed to fetch NanoGPT models: 401');
        });
    });
});
