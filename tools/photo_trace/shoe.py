"""Road shoe outlines from a side photo and a top photo (both toe pointing right, plain white background).

Writes shoe.json in fractions of the shoe length L, local frame: u = 0 heel … 1 toe; y up with 0 = the
ground line (the sole's lower tangent under the heel and the ball of the foot); w lateral, + = lateral.
The photos carry no scale and the top shot is not orthographic, so plan widths are rescaled to the
quoted width fraction.
"""
import cv2, numpy as np, json, sys

CFG = {
 "torch": dict(
   # Medial face of a left shoe, flipped so the toe points right (white upper, black sole).
   side="side.png",
   # Right shoe from above, toe right: the top edge is the medial side, BOA dials on the lateral (bottom) edge.
   top="top.png",
   thr=6,        # object = more than this darker than the white background
   dark=90,      # sole / collar lining = darker than this
   # Pull loop on the tongue: cut from the side silhouette (side px).
   side_cut=[(540, 0), (680, 0), (680, 92), (540, 92)],
   # Floor shadow under the forefoot and past the toe: only the black sole counts inside it (side px).
   side_shadow=[(380, 600), (1500, 560), (1500, 700), (380, 700)],
   # Lateral edge of the top shot runs under the two dials across this px x-range: bridged linearly.
   top_dials_x=(480, 900),
   # Collar opening (lining + insole) in the top shot: seed pixel, and the px x it closes off at the tongue.
   opening_seed=(150, 250), opening_front_x=520,
   # Max plan width as a fraction of length (≈ 103 / 285 mm for a size 43).
   width_frac=0.36,
 ),
}


def runs(col):
    idx = np.nonzero(col)[0]
    return np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1) if len(idx) else []


def silhouette(g, thr):
    m = ((255 - g.astype(int)) > thr).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    m = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8) * 255
    p = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff = p.copy(); h, w = p.shape; cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    return (p | cv2.bitwise_not(ff))[1:-1, 1:-1]


def side_columns(g, c):
    """Per px column: silhouette top, sole top (seam) and sole bottom; the floor shadow below the sole is dropped.
    Where the heel cup overhangs the sole there is no sole: seam = bottom = the silhouette's lower edge."""
    S = silhouette(g, c["thr"])
    D = ((g < c["dark"]) & (S > 0)).astype(np.uint8)
    D = cv2.morphologyEx(D, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cols = {}
    for x in range(S.shape[1]):
        r = runs(S[:, x])
        d = runs(D[:, x])
        if not r:
            continue
        sole = d[-1] if d else None
        if sole is None or sole[-1] < r[0][0] + 0.7 * (r[-1][-1] - r[0][0]):  # none, or only the collar lining
            cols[x] = (r[0][0], r[-1][-1], r[-1][-1])
        else:
            cols[x] = (r[0][0], sole[0], sole[-1])
    return cols


def ground_angle(cols):
    """Angle (rad, image y down) of the sole's lower tangent: the lower-hull edge under the forefoot."""
    xs = np.array(sorted(cols)); ys = np.array([cols[x][2] for x in xs], float)
    pts = np.stack([xs, ys], 1)
    hull = []  # lower hull in image terms = max y
    for p in pts:
        while len(hull) >= 2:
            (x1, y1), (x2, y2) = hull[-2], hull[-1]
            if (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1) >= 0:
                hull.pop()
            else:
                break
        hull.append(tuple(p))
    # Standing on the ground the heel and the forefoot touch: the hull edge bridging the arch.
    x0, x1 = xs.min(), xs.max()
    for (ax, ay), (bx, by) in zip(hull, hull[1:]):
        if ax < x0 + 0.3 * (x1 - x0) and bx > x0 + 0.45 * (x1 - x0):
            return np.arctan2(by - ay, bx - ax), hull
    raise RuntimeError("no hull edge bridging heel and forefoot")


def rotate(im, ang_deg):
    h, w = im.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), ang_deg, 1.0)
    return cv2.warpAffine(im, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))


def smooth(v, k=9):
    v = np.asarray(v, float); pad = np.pad(v, k, mode="edge")
    return np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k]


def trace(c):
    side = cv2.imread(c["side"])
    cv2.fillPoly(side, [np.array(c["side_cut"], np.int32)], (255, 255, 255))
    sh = np.zeros(side.shape[:2], np.uint8); cv2.fillPoly(sh, [np.array(c["side_shadow"], np.int32)], 1)
    side[(sh > 0) & (cv2.cvtColor(side, cv2.COLOR_BGR2GRAY) >= c["dark"])] = 255
    cols = side_columns(cv2.cvtColor(side, cv2.COLOR_BGR2GRAY), c)
    ang, _ = ground_angle(cols)
    side = rotate(side, np.degrees(ang))  # level the ground line
    cols = side_columns(cv2.cvtColor(side, cv2.COLOR_BGR2GRAY), c)
    xs = np.array(sorted(cols)); sx0, sx1 = xs.min(), xs.max()
    Lp = sx1 - sx0
    ground = max(cols[x][2] for x in xs if sx0 + 0.55 * Lp < x < sx0 + 0.8 * Lp)

    us = np.round(np.arange(0, 1.0001, 0.01), 3)
    def side_at(u, i):
        x = int(round(sx0 + u * Lp)); x = min(max(x, sx0), sx1)
        while x not in cols: x += 1 if u < 0.5 else -1
        return (ground - cols[x][i]) / Lp
    top = smooth([side_at(u, 0) for u in us], 2)
    seam = smooth([side_at(u, 1) for u in us], 3)
    bot = smooth([side_at(u, 2) for u in us], 2)

    # Plan: medial (top edge) and lateral (bottom edge) distance from the heel-centre → toe-centre line.
    topim = cv2.imread(c["top"]); tg = cv2.cvtColor(topim, cv2.COLOR_BGR2GRAY)
    T = silhouette(tg, c["thr"])
    tys, txs = np.nonzero(T); tx0, tx1 = txs.min(), txs.max(); Lt = tx1 - tx0
    edge = {}
    for x in range(tx0, tx1 + 1):
        r = np.nonzero(T[:, x])[0]
        if len(r): edge[x] = (r[0], r[-1])
    a, b = c["top_dials_x"]
    ya, yb = edge[a][1], edge[b][1]
    for x in range(a, b + 1):
        edge[x] = (edge[x][0], ya + (yb - ya) * (x - a) / (b - a))
    tx = lambda u: min(max(int(round(tx0 + u * Lt)), tx0), tx1)
    mid = lambda u: sum(edge[tx(u)]) / 2
    c0, c1 = mid(0.1), mid(0.9)
    axis = lambda x: c0 + (c1 - c0) * ((x - tx0) / Lt - 0.1) / 0.8
    med = np.array([(axis(tx(u)) - edge[tx(u)][0]) for u in us])
    lat = np.array([(edge[tx(u)][1] - axis(tx(u))) for u in us])
    kz = c["width_frac"] / ((med + lat).max() / Lt)
    med = smooth(np.maximum(med, 0) / Lt * kz, 2); lat = smooth(np.maximum(lat, 0) / Lt * kz, 2)

    # Collar opening: the dark lining + insole, closed off at the tongue.
    D = (tg < 140).astype(np.uint8) * 255
    D[:, c["opening_front_x"]:] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(D)
    O = (lab == lab[c["opening_seed"][1], c["opening_seed"][0]]).astype(np.uint8) * 255
    O = cv2.morphologyEx(O, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    p = cv2.copyMakeBorder(O, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff = p.copy(); h, w = p.shape; cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    O = (p | cv2.bitwise_not(ff))[1:-1, 1:-1]
    opening = []
    for u in us:
        r = np.nonzero(O[:, tx(u)])[0]
        if len(r) > 5:
            opening.append([float(u), round(float((axis(tx(u)) - r[0]) / Lt * kz), 4), round(float((r[-1] - axis(tx(u))) / Lt * kz), 4)])

    # Overlays for checking each edge against the photo.
    ov = side.copy()
    for arr, col in ((top, (0, 0, 255)), (seam, (0, 200, 0)), (bot, (255, 0, 0))):
        P = np.array([[sx0 + u * Lp, ground - v * Lp] for u, v in zip(us, arr)], np.int32)
        cv2.polylines(ov, [P], False, col, 2, cv2.LINE_AA)
    cv2.imwrite("shoe_side_parts.png", ov)
    ov = topim.copy()
    for arr, sg in ((med, -1), (lat, 1)):
        P = np.array([[tx(u), axis(tx(u)) + sg * v * Lt / kz] for u, v in zip(us, arr)], np.int32)
        cv2.polylines(ov, [P], False, (0, 0, 255), 2, cv2.LINE_AA)
    for i in (1, 2):
        sg = -1 if i == 1 else 1
        P = np.array([[tx(o[0]), axis(tx(o[0])) + sg * o[i] * Lt / kz] for o in opening], np.int32)
        cv2.polylines(ov, [P], False, (0, 200, 0), 2, cv2.LINE_AA)
    cv2.imwrite("shoe_top_parts.png", ov)

    r4 = lambda v: round(float(v), 4)
    tab = lambda arr: [[float(u), r4(v)] for u, v in zip(us, arr)]
    return dict(level_deg=round(float(np.degrees(ang)), 2), top=tab(top), seam=tab(seam), bottom=tab(bot),
                medial=tab(med), lateral=tab(lat), opening=opening)


if __name__ == "__main__":
    out = {k: trace(c) for k, c in CFG.items() if len(sys.argv) < 2 or k in sys.argv[1:]}
    for k, v in out.items():
        print(k, "level", v["level_deg"], {n: len(v[n]) for n in ("top", "seam", "bottom", "medial", "lateral", "opening")})
    json.dump(out, open("shoe.json", "w"))
