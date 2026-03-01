/**
 * Vercel build: write web/config.js with AUTONOMI_API_URL from env.
 * Run from repo root. Vercel sets AUTONOMI_API_URL in Project Settings.
 */
const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const webDir = join(__dirname, '..', 'web');
const apiUrl = process.env.AUTONOMI_API_URL || '';
const content = `// Injected at build time by Vercel (scripts/vercel-env.js)
window.AUTONOMI_API_URL = ${JSON.stringify(apiUrl)};
`;

mkdirSync(webDir, { recursive: true });
writeFileSync(join(webDir, 'config.js'), content, 'utf8');
console.log('[vercel-env] Wrote web/config.js with AUTONOMI_API_URL =', apiUrl || '(empty)');
