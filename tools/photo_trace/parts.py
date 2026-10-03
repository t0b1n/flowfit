import cv2, numpy as np, json
from outline import sil, polymask, contour
CFG = {
 "red": dict(path="red.jpg", thr=22,
   body=[(0,0),(600,0),(600,100),(560,110),(530,121),(515,122),(503,119),(501,150),(497,175),(487,199),(468,208),(450,214),(447,222),(442,260),(0,400)],
   paddle=[(471,331),(460,347),(451,373),(443,397),(435,420),(427,447),(417,473),(408,503),(403,526),(400,560),(330,560),(330,331)],
   clip=[(121,229),(96,243),(104,272),(120,285),(135,284),(162,270)],
   pad_on_lever=False, zoom=[(380,20,545,240),(60,120,220,300),(350,300,540,470),(400,470,520,630)]),
 "da": dict(path="da.png", thr=22,
   body=[(0,0),(440,0),(440,62),(379,66),(372,71),(366,66),(360,61),(350,56),(341,59),(332,67),(322,79),(315,90),(306,105),(301,115),(300,130),(299,147),(290,149),(260,151),(0,170)],
   paddle=[(288,203),(280,207),(268,233),(257,263),(248,290),(243,313),(240,340),(242,357),(247,363),(250,360),(262,327),(275,290),(285,257),(293,227),(295,210),(290,203)],
   clip=[(89,113),(62,124),(70,160),(108,153)],
   pad_on_lever=True, zoom=[(250,0,385,170),(50,30,200,170),(200,180,340,330),(200,320,300,440)]),
}
out = {}
for k, c in CFG.items():
    im, g, S = sil(c["path"], c["thr"])
    S = cv2.bitwise_and(S, cv2.bitwise_not(polymask(S.shape, c["clip"])))
    # drop thin bits left by the clip
    S = cv2.morphologyEx(S, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    B = cv2.bitwise_and(S, polymask(S.shape, c["body"]))
    P = cv2.bitwise_and(S, polymask(S.shape, c["paddle"]))
    L = cv2.bitwise_and(S, cv2.bitwise_not(B))
    if not c["pad_on_lever"]: L = cv2.bitwise_and(L, cv2.bitwise_not(P))
    parts = {n: contour(m, 0.35) for n, m in (("body", B), ("lever", L), ("paddle", P))}
    out[k] = dict(size=im.shape[:2], **parts)
    print(k, {n: len(v) for n, v in parts.items()})
    ov = cv2.resize(im, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    for n, col in (("body", (0, 0, 255)), ("lever", (255, 0, 0)), ("paddle", (0, 200, 0))):
        cv2.polylines(ov, [(np.array(parts[n]) * 2).astype(np.int32)], True, col, 1, cv2.LINE_AA)
    cv2.imwrite(f"{k}_parts.png", ov)
    from crop import crop
    for i, (x0, y0, x1, y1) in enumerate(c.get("zoom", [])):
        crop(c["path"], x0, y0, x1, y1, f"z_{k}_{i}.png", 4, [(parts[n] + parts[n][:1], col) for n, col in (("body", (0, 0, 255)), ("lever", (255, 0, 0)), ("paddle", (0, 200, 0)))])
json.dump(out, open("parts.json", "w"))
