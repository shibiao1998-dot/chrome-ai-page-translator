import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadRuntimeHooks() {
  const source = readFileSync(resolve(process.cwd(), 'src/content/content-runtime.template.js'), 'utf8');
  const injection = `
window.__TEST_HOOKS__ = {
  splitLongText,
  buildSegmentsFromBlocks,
  GitHubTextAdapter
};
`;
  const marker = 'window.__AI_TRANSLATOR_READY__ = true;';
  if (!source.includes(marker)) {
    throw new Error('Failed to find runtime hook injection point');
  }
  const instrumented = source.replace(marker, `${injection}\n    ${marker}`);

  class FakeElement {
    constructor(tagName, text = '') {
      this.tagName = tagName.toUpperCase();
      this.innerText = text;
      this.textContent = text;
      this.isConnected = true;
      this.attributes = new Map();
      this.children = [];
      this.parentElement = null;
    }

    closest() {
      return null;
    }

    matches() {
      return false;
    }

    querySelectorAll() {
      return [];
    }

    querySelector() {
      return null;
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    insertAdjacentElement(_position, element) {
      element.parentElement = this.parentElement;
      return element;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    getBoundingClientRect() {
      return { top: 0, bottom: 100 };
    }

    remove() {}
  }

  const documentMock = {
    body: new FakeElement('body'),
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };

  const windowMock = {
    location: { href: 'https://github.com/org/repo', hostname: 'github.com' },
    innerHeight: 800,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    getComputedStyle() {
      return { display: 'block', visibility: 'visible' };
    },
    addEventListener() {},
    removeEventListener() {}
  };

  const context = {
    window: windowMock,
    document: documentMock,
    console,
    history: {
      pushState() {},
      replaceState() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    sessionStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async () => ({ settings: {}, providers: [] })
      }
    },
    HTMLElement: FakeElement,
    URL,
    Math,
    Date,
    Promise
  };

  vm.runInNewContext(instrumented, context, { filename: 'content-runtime.template.js' });
  return { hooks: context.window.__TEST_HOOKS__, FakeElement, context };
}

test('splitLongText于无句界长段亦切为多块', () => {
  const { hooks } = loadRuntimeHooks();
  const input = 'a'.repeat(2500);

  const chunks = hooks.splitLongText(input, 1200);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1200));
  assert.equal(chunks.join(''), input);
});

test('GitHubTextAdapter于长README不止取前28块', () => {
  const { hooks, FakeElement, context } = loadRuntimeHooks();
  const blocks = Array.from({ length: 40 }, (_, index) => new FakeElement('p', `Paragraph ${index} with enough text to translate.`));
  context.document.querySelectorAll = () => blocks;

  const adapter = new hooks.GitHubTextAdapter();
  const segments = adapter.collectSegments({ minSegmentLength: 12, maxSegmentLength: 1200, siteOverrides: {} });

  assert.equal(segments.length, 40);
});
