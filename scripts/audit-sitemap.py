#!/usr/bin/env python3
"""Audit sitemap URLs over HTTP. Requires httpx and lxml."""
import argparse
import asyncio
from collections import Counter
import json
import re
from statistics import median
import unicodedata
from urllib.parse import urlsplit
from xml.etree import ElementTree

import httpx
from lxml import html


def normalize(text):
    return " ".join(unicodedata.normalize("NFC", text).split())


def words(text):
    return re.findall(r"[^\W_]+", text, re.UNICODE)


def inspect(body):
    doc = html.fromstring(body.decode("utf-8", errors="replace"))
    title = normalize(doc.xpath("string(/html/head/title)"))
    description = normalize(doc.xpath("string(/html/head/meta[@name='description']/@content)"))
    headings = [normalize(h.text_content()) for h in doc.xpath("//h1[not(ancestor::noscript)]")]
    canonical = doc.xpath("string(/html/head/link[@rel='canonical']/@href)").strip()
    main = doc.xpath("//main") or doc.xpath("//body")
    blocks = Counter()
    for container in main:
        for node in container.xpath(".//script|.//style|.//nav|.//noscript|.//header|.//footer|.//template|.//*[@hidden]"):
            if node.getparent() is not None:
                node.drop_tree()
        for node in container.xpath(".//p|.//li|.//h1|.//h2|.//h3|.//td|.//dd"):
            if node.xpath(".//p|.//li|.//h1|.//h2|.//h3|.//td|.//dd"):
                continue
            # Normalize numbers as well so numeric-only template variation does not count.
            text = re.sub(r"\d+", "#", normalize(node.text_content()))
            if text:
                blocks[text] = len(words(text))
    return title, description, headings, canonical, blocks


async def audit(args):
    async with httpx.AsyncClient(timeout=20, limits=httpx.Limits(
        max_connections=args.workers, max_keepalive_connections=args.workers
    )) as client:
        sitemap = (await client.get(args.origin + "/sitemap.xml")).raise_for_status()
        entries = ElementTree.fromstring(sitemap.content).findall("{*}url/{*}loc")
        urls = [entry.text for entry in entries]
        gate = asyncio.Semaphore(args.workers)

        async def fetch(url):
            async with gate:
                for attempt in range(3):
                    try:
                        response = await client.get(args.origin + urlsplit(url).path)
                        status = response.status_code
                        if status == 200:
                            return status, inspect(response.content)
                        if status not in (429, 502, 503, 504):
                            return status, None
                    except httpx.HTTPError:
                        status = 0
                    if attempt < 2:
                        await asyncio.sleep(attempt + 1)
                return status, None

        results = await asyncio.gather(*(fetch(url) for url in urls))

    pages = [page for _, page in results if page]
    titles = Counter(page[0] for page in pages)
    descriptions = Counter(page[1] for page in pages)
    headings = Counter()
    blocks = Counter()
    for _, _, page_headings, _, page_blocks in pages:
        headings.update(set(page_headings))
        blocks.update(page_blocks.keys())

    counts = Counter()
    entity_words = []
    for url, (status, page) in zip(urls, results):
        if not page:
            continue
        title, description, h1, canonical, page_blocks = page
        counts["missing_title"] += not title
        counts["duplicate_title"] += bool(title) and titles[title] > 1
        counts["missing_description"] += not description
        counts["duplicate_description"] += bool(description) and descriptions[description] > 1
        counts["missing_h1"] += not any(h1)
        counts["duplicate_h1_across_pages"] += any(h and headings[h] > 1 for h in h1)
        counts["multiple_h1"] += len(h1) > 1
        counts["missing_canonical"] += not canonical
        counts["canonical_not_self"] += bool(canonical) and canonical != url
        unique_words = sum(length for text, length in page_blocks.items() if blocks[text] == 1)
        counts["under_150_unique_words"] += unique_words < 150
        if urlsplit(url).path.startswith("/courts/"):
            entity_words.append(unique_words)
            counts["entity_under_150_unique_words"] += unique_words < 150

    print(json.dumps({"sitemap_urls": len(urls), "distinct_urls": len(set(urls)),
                      "http_statuses": Counter(status for status, _ in results),
                      "median_entity_unique_words": median(entity_words) if entity_words else None,
                      **counts},
                     indent=2, sort_keys=True))
    if args.failures:
        with open(args.failures, "w", encoding="utf-8") as file:
            json.dump([(url, status) for url, (status, _) in zip(urls, results) if status != 200], file)
    return len(pages) != len(urls)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origin", help="HTTP origin serving the sitemap")
    parser.add_argument("--workers", default=12, type=int)
    parser.add_argument("--failures", help="Optional JSON file for failed URLs")
    raise SystemExit(asyncio.run(audit(parser.parse_args())))
