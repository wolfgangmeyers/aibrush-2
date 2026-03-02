#!/usr/bin/env node
/**
 * Explore NanoGPT API endpoints for model pricing and metadata.
 * Usage: NANOGPT_KEY=your_key node scripts/explore-nanogpt-api.mjs
 */

const BASE_URL = 'https://nano-gpt.com/api/v1';
const API_KEY = process.env.NANOGPT_KEY;

if (!API_KEY) {
    console.error('Set NANOGPT_KEY env var. Get it from browser: localStorage.getItem("nanogptKey")');
    process.exit(1);
}

const headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
};

async function get(path) {
    const url = `${BASE_URL}${path}`;
    console.log(`\nGET ${url}`);
    const res = await fetch(url, { headers });
    console.log(`  Status: ${res.status}`);
    if (!res.ok) {
        const text = await res.text();
        console.log(`  Error: ${text.slice(0, 500)}`);
        return null;
    }
    const data = await res.json();
    return data;
}

async function main() {
    // Try various endpoints to find pricing
    const endpoints = [
        '/image-models',
        '/image-models?detailed=true',
        '/models',
        '/models?detailed=true',
        '/pricing',
        '/image-pricing',
        '/balance',
        '/account',
        '/user',
    ];

    for (const ep of endpoints) {
        const data = await get(ep);
        if (data !== null) {
            console.log('  Response:', JSON.stringify(data, null, 2).slice(0, 2000));
        }
    }
}

main().catch(console.error);
