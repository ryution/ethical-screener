import assert from "node:assert/strict";
import { parseFeed, FEEDS } from "../lib/news.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };
const item = (inner) => `<rss><channel><item><title>Exxon settles</title><link>https://example.org/a</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>${inner}</item></channel></rss>`;
const photo = (inner) => parseFeed(item(inner))[0].image;

console.log("News feeds");

test("reads each outlet's way of attaching a photo", () => {
  assert.equal(photo(`<media:thumbnail url="https://ichef.bbci.co.uk/a.jpg"/>`), "https://ichef.bbci.co.uk/a.jpg");
  assert.equal(photo(`<media:content url="https://i.guim.co.uk/b.jpg" width="140"/>`), "https://i.guim.co.uk/b.jpg");
  assert.equal(photo(`<enclosure url="https://images.mktw.net/c.jpg" type="image/jpeg"/>`), "https://images.mktw.net/c.jpg");
  assert.equal(photo(`<image>https://assets2.cbsnewsstatic.com/d.jpg</image>`), "https://assets2.cbsnewsstatic.com/d.jpg");
  assert.equal(photo(`<description>&lt;img src="https://media.npr.org/e.jpg" /&gt;Text</description>`), "https://media.npr.org/e.jpg");
});

test("drops a photo from a host the page isn't allowed to load", () => {
  assert.equal(photo(`<media:content url="https://tracker.example.com/x.jpg"/>`), null);
  assert.equal(photo(`<media:content url="http://i.guim.co.uk/insecure.jpg"/>`), null);
});

test("reads <item> tags that carry attributes", () => {
  const xml = `<rss><channel><item rdf:about="x"><title>T</title><link>https://example.org/b</link></item></channel></rss>`;
  assert.equal(parseFeed(xml).length, 1);
});

test("turns numbered characters in headlines back into text", () => {
  const xml = `<rss><channel><item><title><![CDATA[Jensen Huang&#x2019;s Handshake &#8212; Q&amp;A]]></title><link>https://example.org/c</link></item></channel></rss>`;
  assert.equal(parseFeed(xml)[0].title, "Jensen Huang’s Handshake — Q&A");
});

test("skips video links", () => {
  const xml = `<rss><channel><item><title>Markets wrap</title><link>https://example.org/news/videos/2026-11-21/x</link></item></channel></rss>`;
  assert.equal(parseFeed(xml).length, 0);
});

test("follows more than two outlets", () => {
  assert.ok(new Set(FEEDS.map((f) => f.source)).size >= 8);
});

console.log(`\n${passed} news tests passed ✓`);
