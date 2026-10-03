import cv2, numpy as np


def load(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im.ndim == 3 and im.shape[2] == 4:
        a = im[:, :, 3:4].astype(float) / 255
        im = (im[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
    return im


def sil(path, thr, fill_holes=True):
    im = load(path)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    # Per-row background (the Shimano shot has a vertical grey gradient); object = clearly darker than its row.
    bg = np.maximum(np.median(g[:, :8], axis=1), np.median(g[:, -8:], axis=1))[:, None]
    m = (g.astype(int) < bg - thr).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    m = (lab == big).astype(np.uint8) * 255
    if fill_holes:
        p = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
        ff = p.copy(); h, w = p.shape; cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
        m = (p | cv2.bitwise_not(ff))[1:-1, 1:-1]
    return im, g, m


def polymask(shape, pts):
    m = np.zeros(shape, np.uint8); cv2.fillPoly(m, [np.array(pts, np.int32)], 255); return m


def smooth_simplify(c, eps, w=5):
    # Circular moving average removes pixel stair-steps; window ~5 px keeps corners crisp.
    c = c.astype(float); pad = np.vstack([c[-w:], c, c[:w]])
    k = np.ones(2 * w + 1) / (2 * w + 1)
    sm = np.stack([np.convolve(pad[:, i], k, mode="same")[w:-w] for i in (0, 1)], axis=1)
    ap = cv2.approxPolyDP(sm.astype(np.float32).reshape(-1, 1, 2), eps, True)
    return [(round(float(p[0][0]), 1), round(float(p[0][1]), 1)) for p in ap]


def contour(m, eps, w=5):
    m = (cv2.GaussianBlur(m, (5, 5), 1.0) > 127).astype(np.uint8) * 255
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return smooth_simplify(max(cs, key=cv2.contourArea)[:, 0, :], eps, w)


def holes(m, eps, min_area, w=5):
    """Inner contours (through-holes) of a mask that was segmented with fill_holes=False."""
    m = (cv2.GaussianBlur(m, (5, 5), 1.0) > 127).astype(np.uint8) * 255
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    return [smooth_simplify(c[:, 0, :], eps, w) for c, h in zip(cs, hier[0])
            if h[3] >= 0 and cv2.contourArea(c) >= min_area]
