#!/usr/bin/env node
/**
 * Test NanoGPT img2img directly without the browser.
 * Usage: node scripts/test-img2img.mjs <API_KEY> [model]
 *
 * Sends a solid red 256x256 image with prompt "make it blue" at strength 0.8.
 * Saves result to /tmp/nanogpt-img2img-result.png.
 * If the model is actually using the source image, the result should look
 * different from a plain text-to-image of the same prompt.
 */

import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const API_KEY = process.argv[2];
const MODEL = process.argv[3] || 'runware:107@1';
const BASE_URL = 'https://nano-gpt.com/api/v1';

if (!API_KEY) {
    console.error('Usage: node scripts/test-img2img.mjs <API_KEY> [model]');
    process.exit(1);
}

// CRC32 for PNG chunks
function crc32(buf) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBytes = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function createSolidPNG(width, height, r, g, b) {
    const rowSize = width * 3;
    const raw = Buffer.alloc((rowSize + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (rowSize + 1)] = 0; // filter type None
        for (let x = 0; x < width; x++) {
            const off = y * (rowSize + 1) + 1 + x * 3;
            raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
        }
    }
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB
    return Buffer.concat([sig, makeChunk('IHDR', ihdrData), makeChunk('IDAT', deflateSync(raw)), makeChunk('IEND', Buffer.alloc(0))]);
}

async function callAPI(body) {
    const resp = await fetch(`${BASE_URL}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API error ${resp.status}: ${text}`);
    }
    return resp.json();
}

async function main() {
    const redPNG = createSolidPNG(256, 256, 220, 50, 50);
    const imageDataUrl = 'data:image/png;base64,' + redPNG.toString('base64');

    console.log(`Model: ${MODEL}`);
    console.log(`Source image: solid red 256x256 PNG (${imageDataUrl.length} chars)`);
    console.log(`Prompt: "make it blue"`);
    console.log(`Strength: 0.8\n`);

    console.log('Sending img2img request...');
    const data = await callAPI({
        model: MODEL,
        prompt: 'make it blue',
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
        imageDataUrl,
        strength: 0.8,
    });

    console.log(`Cost: $${data.cost}`);
    console.log(`Remaining balance: $${data.remainingBalance}`);
    console.log(`Images returned: ${data.data?.length}`);

    if (data.data?.[0]?.b64_json) {
        const outPath = '/tmp/nanogpt-img2img-result.png';
        writeFileSync(outPath, Buffer.from(data.data[0].b64_json, 'base64'));
        console.log(`\nResult saved to ${outPath}`);
        console.log('If img2img is working, the result should be predominantly blue.');
        console.log('If it ignores the source, it will be whatever the model imagines for "make it blue".');
    } else {
        console.error('No image data in response:', JSON.stringify(data));
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });
