"""Saddle outlines from a side photo and a top photo (both nose pointing right, plain white background).

Writes saddle.json in mm, local frame: x forward (0 = mid-length, nose at +length/2), y up with
0 = rail centreline through the straight clamp section, z lateral (top photo).
"""
import cv2, numpy as np, json, sys
from outline import sil, polymask, contour, holes

CFG = {
 "power": dict(
   side="side.png", top="top.jpg", thr=25,
   # Maker dims (S-Works Power 143): the photos carry no scale.
   length=240.0, width=143.0,
   # Shell = everything above this line; rails below. Only precise where the rails merge into the
   # carbon base (tail x<450, nose x>1000); in between there is daylight between shell and rail.
   shell=[(0, 0), (1214, 0), (1214, 690), (1075, 668), (1040, 650), (1000, 636), (900, 636),
          (450, 707), (440, 708), (400, 711), (350, 704), (300, 684), (250, 649), (200, 614),
          (150, 596), (0, 600)],
   rail_clamp=(450, 790),   # px x-range of the straight clamp section, sets y = 0
 ),
}


def runs(col):
    idx = np.nonzero(col)[0]
    return np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1) if len(idx) else []


def trace(c):
    _, _, S = sil(c["side"], c["thr"], fill_holes=False)
    _, _, T = sil(c["top"], c["thr"], fill_holes=False)
    ys, xs = np.nonzero(S); sx0, sx1 = xs.min(), xs.max()
    ty, tx = np.nonzero(T); tx0, tx1, ty0, ty1 = tx.min(), tx.max(), ty.min(), ty.max()
    L, W = c["length"], c["width"]
    ks = (sx1 - sx0) / L                      # side px/mm
    kx, kz = (tx1 - tx0) / L, (ty1 - ty0) / W  # top px/mm (photo is ~1.5% short of the quoted length)
    zc = (ty0 + ty1) / 2

    shellM = cv2.bitwise_and(S, polymask(S.shape, c["shell"]))
    railM = cv2.bitwise_and(S, cv2.bitwise_not(shellM))
    railM = cv2.morphologyEx(railM, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    a, b = c["rail_clamp"]
    y0 = np.mean([(r[0] + r[-1]) / 2 for x in range(a, b, 5) for r in runs(railM[:, x])[-1:]])

    side_mm = lambda p: [round((p[0] - sx0) / ks - L / 2, 1), round((y0 - p[1]) / ks, 1)]
    top_mm = lambda p: [round((p[0] - tx0) / kx - L / 2, 1), round((p[1] - zc) / kz, 1)]

    # Per-x curves sampled every 2 mm: shell top / bottom and rail centreline (side), half-width (top).
    xs_mm = np.arange(-L / 2, L / 2 + 1e-6, 2.0)
    top, bot, rail, hw = [], [], [], []
    for xm in xs_mm:
        sxp = int(round(sx0 + (xm + L / 2) * ks)); sxp = min(max(sxp, sx0), sx1)
        r = runs(shellM[:, sxp])
        if r:
            top.append([round(xm, 1), round((y0 - r[0][0]) / ks, 1)])
            bot.append([round(xm, 1), round((y0 - r[-1][-1]) / ks, 1)])
        rr = runs(railM[:, sxp])
        if rr and len(rr[-1]) > 20:
            rail.append([round(xm, 1), round((y0 - (rr[-1][0] + rr[-1][-1]) / 2) / ks, 1)])
        txp = int(round(tx0 + (xm + L / 2) * kx)); txp = min(max(txp, tx0), tx1)
        col = np.nonzero(T[:, txp])[0]
        if len(col):
            # symmetrise: mean of the two half-widths about the photo's centreline
            hw.append([round(xm, 1), round(((zc - col[0]) + (col[-1] - zc)) / 2 / kz, 1)])

    hole = max(holes(T, 0.8, 2000), key=len)
    hole = [top_mm(p) for p in hole]
    # symmetrise the hole: half-width per x from both sides
    hx = np.array(hole)
    xs_h = np.arange(hx[:, 0].min(), hx[:, 0].max() + 1e-6, 1.5)
    halfw = []
    hm = polymask(T.shape, [((x + L / 2) * kx + tx0, z * kz + zc) for x, z in hole])
    for xm in xs_h:
        col = np.nonzero(hm[:, int(round(tx0 + (xm + L / 2) * kx))])[0]
        if len(col): halfw.append([round(xm, 1), round(((zc - col[0]) + (col[-1] - zc)) / 2 / kz, 1)])

    shell_poly = [side_mm(p) for p in contour(shellM, 0.6)]
    rail_poly = [side_mm(p) for p in contour(railM, 0.6)]

    ov = cv2.imread(c["side"])
    for poly, col in ((shell_poly, (0, 0, 255)), (rail_poly, (255, 0, 0))):
        P = np.array([[(x + L / 2) * ks + sx0, y0 - y * ks] for x, y in poly], np.int32)
        cv2.polylines(ov, [P], True, col, 2, cv2.LINE_AA)
    cv2.imwrite("saddle_side_parts.png", ov)
    ov = cv2.imread(c["top"])
    for sgn in (1, -1):
        P = np.array([[(x + L / 2) * kx + tx0, zc + sgn * h * kz] for x, h in hw], np.int32)
        cv2.polylines(ov, [P], False, (0, 0, 255), 2, cv2.LINE_AA)
        P = np.array([[(x + L / 2) * kx + tx0, zc + sgn * h * kz] for x, h in halfw], np.int32)
        cv2.polylines(ov, [P], False, (0, 200, 0), 2, cv2.LINE_AA)
    cv2.imwrite("saddle_top_parts.png", ov)
    return dict(length=L, width=W, px_per_mm=dict(side=round(ks, 3), top_x=round(kx, 3), top_z=round(kz, 3)),
                shell=shell_poly, rail=rail_poly, top=top, bottom=bot, railLine=rail,
                halfWidth=hw, holeHalfWidth=halfw)


if __name__ == "__main__":
    out = {k: trace(c) for k, c in CFG.items() if len(sys.argv) < 2 or k in sys.argv[1:]}
    for k, v in out.items():
        print(k, v["px_per_mm"], {n: len(v[n]) for n in ("shell", "rail", "top", "railLine", "halfWidth", "holeHalfWidth")})
    json.dump(out, open("saddle.json", "w"))
