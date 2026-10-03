"""Time slider steps in the Fit Builder and profile the JavaScript cost (docs/plans/ortho-views.md).

Steps the first range slider (rider height) N times with the arrow keys and, for each step, measures the time from
the key press to two animation frames later. The two-frame wait itself is ~33 ms at 60 Hz, so subtract that from the
medians. A CDP sampling profile of the same steps attributes JavaScript time to our mesh builders.

Requires: `pip install playwright` (do NOT run `playwright install`; it uses the preinstalled Chromium) and the Vite
dev server on :5173 (`make web-dev`). Software-rendered GPU time in a container is meaningless; compare the
"our JS per step" numbers, not the wall-clock medians, between machines.

    python tools/perf/slider_profile.py --view side   # 2D side view (or the ortho view once Phase 3 lands)
    python tools/perf/slider_profile.py --view 3d     # the 3D view
"""
import argparse
import asyncio
import collections
import os

from playwright.async_api import async_playwright

BUILDERS = (
    "buildBikeMeshes", "buildFrameMeshes", "buildComponentMeshes", "buildRiderMeshes", "buildRiderParts",
    "buildHoodMeshes", "buildBar", "muscleLimbGeometry", "limbGeometry", "computeVertexNormals", "forkGeometry",
    "bendTorso", "getProgramInfoLog",
)


def summarise(profile: dict, steps: int) -> None:
    nodes = {n["id"]: n for n in profile["nodes"]}
    parent = {c: n["id"] for n in profile["nodes"] for c in n.get("children", [])}
    self_us = collections.Counter()
    for sid, d in zip(profile["samples"], profile["timeDeltas"]):
        self_us[sid] += d
    ours = 0.0
    incl = collections.Counter()
    for nid, us in self_us.items():
        url = nodes[nid]["callFrame"]["url"]
        if "/src/" in url:
            ours += us
        seen, x = set(), nid
        while x is not None:
            fn = nodes[x]["callFrame"]["functionName"]
            if fn in BUILDERS and fn not in seen:
                incl[fn] += us
                seen.add(fn)
            x = parent.get(x)
    print(f"  our source files (self time): {ours / 1000 / steps:.1f} ms per step")
    for fn, us in incl.most_common():
        print(f"  {fn:24s} {us / 1000 / steps:7.1f} ms per step (inclusive)")


async def main(view: str, steps: int, url: str) -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium"),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        )
        page = await browser.new_page(viewport={"width": 1600, "height": 1000})
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(1500)
        if view != "side":
            await page.locator(f"text=/^{view}$/i").first.click()
            await page.wait_for_timeout(6000 if view == "3d" else 1500)
        cdp = await page.context.new_cdp_session(page)
        await cdp.send("Profiler.enable")
        await cdp.send("Profiler.setSamplingInterval", {"interval": 200})
        slider = page.locator("input[type=range]").first
        await slider.focus()
        await cdp.send("Profiler.start")
        times = []
        for i in range(steps):
            t0 = await page.evaluate("performance.now()")
            await page.keyboard.press("ArrowRight" if i % 2 == 0 else "ArrowLeft")
            await page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
            times.append(await page.evaluate("performance.now()") - t0)
        profile = (await cdp.send("Profiler.stop"))["profile"]
        times.sort()
        print(f"{view}: median {times[len(times) // 2]:.0f} ms, p90 {times[int(len(times) * 0.9)]:.0f} ms per step (wall clock)")
        summarise(profile, steps)
        await browser.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--view", default="3d", choices=["side", "front", "3d"])
    ap.add_argument("--steps", type=int, default=25)
    ap.add_argument("--url", default="http://localhost:5173/")
    a = ap.parse_args()
    asyncio.run(main(a.view, a.steps, a.url))
