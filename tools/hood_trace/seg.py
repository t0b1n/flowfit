import cv2, numpy as np, sys
def sil(path, thr):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 4:
        a = im[:, :, 3:4].astype(float) / 255
        im = (im[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    # Per-row background (the Shimano shot has a vertical grey gradient); object = clearly darker than its row.
    bg = np.maximum(np.median(g[:, :8], axis=1), np.median(g[:, -8:], axis=1))[:, None]
    m = (g.astype(int) < bg - thr).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    m = (lab == big).astype(np.uint8) * 255
    # fill holes
    p = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff = p.copy(); h, w = p.shape; cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    m = (p | cv2.bitwise_not(ff))[1:-1, 1:-1]
    return im, g, m
for name, path, thr in [("red", "red.jpg", 200), ("da", "da.png", 185)]:
    im, g, m = sil(path, thr)
    print(name, im.shape, "bg samples", g[5, 5], g[-5, 5], g[-5, -5], "obj px", (m > 0).sum())
    cv2.imwrite(f"{name}_mask.png", m)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    ov = cv2.resize(im, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    cv2.drawContours(ov, [c * 2 for c in cs], -1, (0, 0, 255), 1)
    cv2.imwrite(f"{name}_sil.png", ov)
