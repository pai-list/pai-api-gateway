import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

type WorkerRequest = Parameters<typeof worker.fetch>[0];

function makeRequest(url: string, init?: RequestInit): WorkerRequest {
  return new Request(url, init) as unknown as WorkerRequest;
}

describe('axiomid-subdomain-redirect worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('responds 204 with CORS headers on OPTIONS preflight', async () => {
    const res = await worker.fetch(makeRequest('https://amrikyy.axiomid.app/', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('passes through WebSocket upgrades to origin fetch', async () => {
    const upstream = new Response(null, { status: 200 });
    const fetchSpy = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal('fetch', fetchSpy);

    const res = await worker.fetch(
      makeRequest('https://amrikyy.axiomid.app/ws', { headers: { Upgrade: 'websocket' } }),
    );
    expect(res).toBe(upstream);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('passes through apex domain and registered capability subdomains untouched', async () => {
    const fetchSpy = vi.fn().mockImplementation(async () => new Response('origin', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    for (const host of ['axiomid.app', 'docs.axiomid.app', 'api.axiomid.app', 'skills.axiomid.app', 'piverify.axiomid.app']) {
      const res = await worker.fetch(makeRequest(`https://${host}/health`));
      expect(res.status).toBe(200);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('preserves pathname and query parameters on alias redirects (301)', async () => {
    const res = await worker.fetch(makeRequest('https://pai-docs.axiomid.app/guide?lang=ar#top'));
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://docs.axiomid.app/guide?lang=ar');

    const jobsRes = await worker.fetch(makeRequest('https://jobs.axiomid.app/bounties?tier=pro'));
    expect(jobsRes.status).toBe(301);
    expect(jobsRes.headers.get('Location')).toBe('https://earn.axiomid.app/bounties?tier=pro');
  });

  it('guards against Object.prototype pollution on alias lookup (constructor, toString)', async () => {
    const constructorRes = await worker.fetch(makeRequest('https://constructor.axiomid.app/'));
    expect(constructorRes.status).toBe(301);
    expect(constructorRes.headers.get('Location')).toBe('https://axiomid.app/passport/constructor');

    const toStringRes = await worker.fetch(makeRequest('https://toString.axiomid.app/'));
    expect(toStringRes.status).toBe(301);
    expect(toStringRes.headers.get('Location')).toBe('https://axiomid.app/passport/tostring');
  });

  it('redirects reserved subdomains to root and vanity agent subdomains to passport', async () => {
    const reserved = await worker.fetch(makeRequest('https://dashboard.axiomid.app/'));
    expect(reserved.status).toBe(301);
    expect(reserved.headers.get('Location')).toBe('https://axiomid.app');

    const agent = await worker.fetch(makeRequest('https://Amrikyy.axiomid.app/profile'));
    expect(agent.status).toBe(301);
    expect(agent.headers.get('Location')).toBe('https://axiomid.app/passport/amrikyy');
  });

  it('rejects malformed or too-short subdomains with 400', async () => {
    const tooShort = await worker.fetch(makeRequest('https://ab.axiomid.app/'));
    expect(tooShort.status).toBe(400);

    const dunderProto = await worker.fetch(makeRequest('https://__proto__.axiomid.app/'));
    expect(dunderProto.status).toBe(400);
  });
});
