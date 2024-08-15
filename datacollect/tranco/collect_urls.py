"""
Collect URLs from tranco
"""
import tranco
import random
import json
import aiohttp
import asyncio

counter = 0

def tranco_list(cache=True) -> tranco.tranco.TrancoList:
    t = tranco.Tranco(cache=cache, cache_dir='.tranco')
    return t.list()

async def check_url_working(url) -> (str, bool):
    """async check if the URL is working"""
    global counter
    good = False
    try:
        timeout = aiohttp.ClientTimeout(total=10)  
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=timeout) as response:
                good = response.status == 200
    except:
        pass
    print("Finished", url, good, counter)
    counter += 1
    return (url, good)

    
async def sample_urls(range_n=100):
    """
    Entry func
    Sample range_n URLs from 1-1k, 1k-10k, 10k-100k, 100k-1M respectively
    """
    tl = tranco_list()
    all_urls = tl.top(1_000_000)
    ranges = [(1, 1_000), (1_000, 10_000), (10_000, 100_000), (100_000, 1_000_000)]
    sample_urls = []
    for r in ranges:
        urls = random.sample(all_urls[r[0]:r[1]], int(2*range_n))
        urls_working = await asyncio.gather(*(check_url_working(f'https://{url}') for url in urls))
        urls_working = [url for url, working in urls_working if working]
        assert(len(urls_working) >= range_n)
        sample_urls.append({
            "range": f"{r[0]}-{r[1]}",
            "urls": urls_working[:range_n]
        })
    json.dump(sample_urls, open('tranco_urls_sample.json', 'w+'), indent=2)

if __name__ == "__main__":
    asyncio.run(sample_urls(100))