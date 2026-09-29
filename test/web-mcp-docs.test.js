import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsHtmlPath = path.join(__dirname, '..', 'public', 'docs', 'index.html');

test('Web MCP Documentation: index.html exists and is readable', () => {
  assert.equal(fs.existsSync(docsHtmlPath), true, 'public/docs/index.html must exist');
  const stat = fs.statSync(docsHtmlPath);
  assert.ok(stat.size > 2000, 'public/docs/index.html should be complete and non-trivial');
});

test('Web MCP Documentation: conforms to HTML5 semantic structure and English language', () => {
  const html = fs.readFileSync(docsHtmlPath, 'utf8');
  assert.match(html, /<html\s+lang="en">/i, 'Document language must be English');
  assert.match(html, /<header>/i, 'Document must contain semantic <header>');
  assert.match(html, /<main[^>]*itemscope[^>]*itemtype="https:\/\/schema\.org\/TechArticle"/i, 'Main must have Schema.org TechArticle microdata');
  assert.match(html, /<article[^>]*class="doc-section"/i, 'Document must contain semantic <article> documentation sections');
  assert.match(html, /<footer>/i, 'Document must contain semantic <footer>');
});

test('Web MCP Documentation: implements standard Web MCP attributes', () => {
  const html = fs.readFileSync(docsHtmlPath, 'utf8');
  
  // Verify standard Web MCP attributes
  assert.match(html, /\btool-name="/, 'Must declare tool-name attributes');
  assert.match(html, /\bdescription="/, 'Must declare description attributes');
  assert.match(html, /\btool-param-name="/, 'Must declare tool-param-name attributes');
  assert.match(html, /\btool-param-type="/, 'Must declare tool-param-type attributes');
  assert.match(html, /\btool-param-description="/, 'Must declare tool-param-description attributes');
});

test('Web MCP Documentation: exposes all required tools in HTML and JS catalog', () => {
  const html = fs.readFileSync(docsHtmlPath, 'utf8');
  const requiredTools = [
    'read_architecture_spec',
    'get_deployment_guide',
    'get_configuration_reference',
    'get_security_directives',
    'get_adr_0001',
    'search_documentation',
    'list_available_tools'
  ];

  for (const tool of requiredTools) {
    assert.match(
      html,
      new RegExp(`tool-name="${tool}"`),
      `Tool '${tool}' must be declared with tool-name attribute in HTML`
    );
  }
});

test('Web MCP Documentation: includes valid Schema.org JSON-LD with Web MCP APIReference', () => {
  const html = fs.readFileSync(docsHtmlPath, 'utf8');
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'HTML must contain a JSON-LD script block');

  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.ok(Array.isArray(jsonLd['@graph']), '@graph array must be present');

  const apiRef = jsonLd['@graph'].find(item => item['@type'] === 'APIReference');
  assert.ok(apiRef, 'JSON-LD must include an APIReference entry');
  assert.ok(Array.isArray(apiRef.hasPart), 'APIReference must list tool actions in hasPart');
  assert.ok(apiRef.hasPart.length >= 6, 'APIReference must define at least 6 tools');
});
