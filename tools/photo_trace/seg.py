import cv2, sys
from outline import sil

if __name__ == "__main__":
    for name, path, thr in [("red", "red.jpg", 200), ("da", "da.png", 185)]:
        im, g, m = sil(path, thr)
        print(name, im.shape, "bg samples", g[5, 5], g[-5, 5], g[-5, -5], "obj px", (m > 0).sum())
        cv2.imwrite(f"{name}_mask.png", m)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        ov = cv2.resize(im, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        cv2.drawContours(ov, [c * 2 for c in cs], -1, (0, 0, 255), 1)
        cv2.imwrite(f"{name}_sil.png", ov)
