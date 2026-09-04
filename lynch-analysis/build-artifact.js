#!/usr/bin/env node
/*
 * Bundle the app into a single self-contained HTML file.
 *
 *   node lynch-analysis/build-artifact.js [outfile]
 *
 * index.html plus its stylesheet and scripts are inlined, so the result runs
 * from a single file — handy for emailing, hosting, or publishing as an
 * Artifact (which supplies its own <!doctype>/<head>/<body> skeleton, so the
 * output deliberately omits those wrappers).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const out = process.argv[2] || path.join(dir, 'dist', 'lynch-analysis.html');

const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const html = read('index.html');
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!body) throw new Error('index.html has no <body> — cannot bundle.');

const markup = body[1]
  .replace(/\s*<script\s+src=[^>]*><\/script>/gi, '')
  .trim();

const bundle = [
  '<title>Lynch Analysis</title>',
  '<style>',
  read('styles.css').trim(),
  '</style>',
  markup,
  '<script>',
  read('lynch.js').trim(),
  '</script>',
  '<script>',
  read('app.js').trim(),
  '</script>',
  ''
].join('\n');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bundle);
console.log(`Wrote ${out} (${(bundle.length / 1024).toFixed(1)} kB)`);
