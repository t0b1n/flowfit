import cv2, numpy as np, sys, json
def crop(path, x0, y0, x1, y1, out, k=4, polys=None):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 4: im = im[:, :, :3]
    c = cv2.resize(im[y0:y1, x0:x1], None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
    for x in range(x0 - x0 % 10 + 10, x1, 10):
        X = (x - x0) * k; col = (0, 0, 255) if x % 50 == 0 else (200, 160, 160)
        cv2.line(c, (X, 0), (X, c.shape[0]), col, 1)
        if x % 50 == 0: cv2.putText(c, str(x), (X + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
    for y in range(y0 - y0 % 10 + 10, y1, 10):
        Y = (y - y0) * k; col = (0, 0, 255) if y % 50 == 0 else (200, 160, 160)
        cv2.line(c, (0, Y), (c.shape[1], Y), col, 1)
        if y % 50 == 0: cv2.putText(c, str(y), (2, Y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
    for pts, colr in (polys or []):
        P = np.array([[(x - x0) * k, (y - y0) * k] for x, y in pts]).astype(np.int32)
        cv2.polylines(c, [P], False, colr, 2)
    cv2.imwrite(out, c)
if __name__ == "__main__":
    a = sys.argv; crop(a[1], *map(int, a[2:6]), a[6], int(a[7]) if len(a) > 7 else 4)
