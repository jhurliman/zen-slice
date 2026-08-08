#!/usr/bin/env python3
"""r5 check (b): does particle blur vary with depth?

The r4 stage verdict measured "141 droplets spanning 4->26 px apparent diameter
all rendering at 1.46-1.75 px of 10-90 edge" in 00-hero. Depth is not directly
observable in a PNG, but a lens couples defocus to BOTH apparent size and edge
softness, so the test is: does 10-90 edge width correlate with apparent diameter
across the droplet population of one frame?

Edge width per blob (the stage report's area metric, which is robust to the
blob not being round):
    w = sqrt(A10/pi) - sqrt(A90/pi)
where A10/A90 are the areas of the blob above 10% / 90% of its own peak above
local background.
"""
import numpy as np, sys
from PIL import Image
from scipy import ndimage

def lum(a): return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]

def droplets(path, min_area=4, max_area=1600, max_bbox=60):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    L = lum(a)
    bg = ndimage.gaussian_filter(L, 9.0)
    hp = L - bg
    # particles = high-frequency bright things
    m = hp > 6.0
    # remove the opaque fruit body (big smooth bright region) and the blade streak
    body = ndimage.binary_closing(L > 30, np.ones((9,9)))
    body, n = ndimage.label(body, np.ones((3,3)))
    if n:
        sz = ndimage.sum(np.ones_like(L), body, range(1, n+1))
        big = np.zeros(n+1, bool)
        big[1:] = sz > 4000
        m = m & ~ndimage.binary_dilation(big[body], np.ones((7,7)))
    lab, n = ndimage.label(m, np.ones((3,3)))
    out = []
    objs = ndimage.find_objects(lab)
    for i, sl in enumerate(objs, 1):
        sub = (lab[sl] == i)
        area = int(sub.sum())
        h, w = sub.shape
        if area < min_area or area > max_area: continue
        if h > max_bbox or w > max_bbox: continue
        # pad a ring for a local background estimate
        y0 = max(sl[0].start-3, 0); y1 = min(sl[0].stop+3, L.shape[0])
        x0 = max(sl[1].start-3, 0); x1 = min(sl[1].stop+3, L.shape[1])
        pat = L[y0:y1, x0:x1]
        msk = (lab[y0:y1, x0:x1] == i)
        ring = ~ndimage.binary_dilation(lab[y0:y1, x0:x1] > 0, np.ones((3,3)))
        base = np.median(pat[ring]) if ring.sum() > 6 else np.median(pat[~msk]) if (~msk).sum() else 0.0
        peak = pat[msk].max() - base
        if peak < 8: continue
        v = pat - base
        # restrict to the connected neighbourhood so a neighbour blob cannot leak in
        near = ndimage.binary_dilation(msk, np.ones((5,5)))
        a10 = float(((v >= 0.10*peak) & near).sum())
        a90 = float(((v >= 0.90*peak) & near).sum())
        if a10 <= 0 or a90 <= 0: continue
        wedge = np.sqrt(a10/np.pi) - np.sqrt(a90/np.pi)
        diam = 2.0*np.sqrt(a10/np.pi)
        out.append((diam, wedge, peak, area))
    return np.array(out)

def report(path, label):
    d = droplets(path)
    if len(d) == 0: print(f'{label}: none'); return
    diam, w, peak, area = d[:,0], d[:,1], d[:,2], d[:,3]
    r = np.corrcoef(diam, w)[0,1]
    # spearman
    from scipy.stats import spearmanr
    rs, p = spearmanr(diam, w)
    print(f'{label}: n={len(d)}  apparent diameter {diam.min():.1f}->{diam.max():.1f} px')
    print(f'   10-90 edge width: min {w.min():.2f}  p25 {np.percentile(w,25):.2f}  med {np.median(w):.2f}  p75 {np.percentile(w,75):.2f}  max {w.max():.2f} px')
    print(f'   pearson r(diam, edge) = {r:.3f}   spearman = {rs:.3f} (p={p:.2e})')
    bins = [(0,8),(8,12),(12,18),(18,60)]
    for lo,hi in bins:
        s = (diam>=lo)&(diam<hi)
        if s.sum()>2:
            print(f'   diam {lo:2d}-{hi:2d} px: n={int(s.sum()):4d}  mean edge {w[s].mean():5.2f} px  mean peak {peak[s].mean():6.1f}')
    print(f'   peak lum vs diameter: r = {np.corrcoef(diam, peak)[0,1]:.3f} (a real lens dims what it spreads)')
    return dict(n=len(d), r=float(r), rs=float(rs))

if __name__=='__main__':
    for p,l in [('/home/claude/juice/shots/r4/00-hero.png','r4 00-hero'),
                ('/home/claude/juice/shots/r5/00-hero.png','r5 00-hero')]:
        report(p,l); print()
