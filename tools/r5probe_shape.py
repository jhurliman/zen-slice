import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, '/home/claude/juice/tools')
from r5probe_juice import load, lum, sat, S8, disk, free_droplets, body_mask, allpart

def cull(m, W):
    lab, n = ndi.label(m, structure=S8); objs = ndi.find_objects(lab)
    ar = ndi.sum(m, lab, range(1, n+1)); keep = np.zeros(n+1, bool)
    for i, sl in enumerate(objs):
        w = sl[1].stop - sl[1].start
        if w > 0.35*W or ar[i] > 1500: continue
        keep[i+1] = True
    return keep[lab]

def ellipse_iou(sub):
    """IoU between blob and the ellipse with matching centroid+2nd moments+area."""
    ys, xs = np.nonzero(sub)
    A = len(ys)
    cy, cx = ys.mean(), xs.mean()
    dy, dx = ys-cy, xs-cx
    cov = np.array([[ (dy*dy).mean(), (dy*dx).mean() ],
                    [ (dy*dx).mean(), (dx*dx).mean() ]])
    w, v = np.linalg.eigh(cov)
    w = np.maximum(w, 1e-6)
    # ellipse semi-axes scaled so its area == A
    a = 2*np.sqrt(w[1]); b = 2*np.sqrt(w[0])
    s = np.sqrt(A/(np.pi*a*b))
    a *= s; b *= s
    Y, X = np.mgrid[0:sub.shape[0], 0:sub.shape[1]]
    Dy, Dx = Y-cy, X-cx
    u = (Dy*v[0,1] + Dx*v[1,1])/a
    t = (Dy*v[0,0] + Dx*v[1,0])/b
    ell = (u*u + t*t) <= 1.0
    inter = np.logical_and(ell, sub).sum(); uni = np.logical_or(ell, sub).sum()
    ang = np.degrees(np.arctan2(v[0,1], v[1,1])) % 180
    return inter/max(uni,1), a/max(b,1e-6), ang

def shapes(mask, a, minarea=12):
    L = lum(a); S = sat(a)
    lab, n = ndi.label(mask, structure=S8)
    objs = ndi.find_objects(lab)
    out = []
    for i, sl in enumerate(objs):
        sub = (lab[sl] == i+1)
        A = int(sub.sum())
        if A < minarea: continue
        iou, ar, ang = ellipse_iou(sub)
        Ls = L[sl]*sub
        ys, xs = np.nonzero(sub)
        cy, cx = ys.mean(), xs.mean()
        by, bx = np.unravel_index(np.argmax(Ls), Ls.shape)
        rad = np.sqrt(A/np.pi)
        out.append(dict(area=A, iou=float(iou), aspect=float(ar), ang=float(ang),
                        hlr=float(np.hypot(by-cy, bx-cx)/max(rad,1e-6)),
                        hlang=float(np.degrees(np.arctan2(by-cy, bx-cx)) % 360),
                        sat=float(S[sl][sub].mean())))
    return out

def summarize(rows, label):
    if not rows:
        print(f'{label}: NO BLOBS'); return None
    ar = np.array([r['area'] for r in rows], float)
    iou = np.array([r['iou'] for r in rows])
    asp = np.array([r['aspect'] for r in rows])
    ang = np.array([r['ang'] for r in rows])
    hlr = np.array([r['hlr'] for r in rows])
    hla = np.radians(np.array([r['hlang'] for r in rows]))
    # circular variance of orientation (mod 180 -> double angle)
    z = np.exp(2j*np.radians(ang)); ocv = 1-abs(z.mean())
    zz = np.exp(1j*hla); hcv = 1-abs(zz.mean())
    d = dict(nBlobs=len(rows),
             medArea=float(np.median(ar)), p95Area=float(np.percentile(ar,95)),
             maxArea=float(ar.max()), tail_p95_over_med=round(float(np.percentile(ar,95)/np.median(ar)),2),
             medEllipseIoU=round(float(np.median(iou)),3),
             frac_IoU_ge_090=round(100*float((iou>=0.90).mean()),1),
             medAspect=round(float(np.median(asp)),2),
             aspectCV=round(float(asp.std()/asp.mean()),3),
             aspectIQR=round(float(np.percentile(asp,75)-np.percentile(asp,25)),3),
             orientCircVar=round(float(ocv),3),
             medHighlightOffset=round(float(np.median(hlr)),3),
             highlightAngCircVar=round(float(hcv),3))
    print(label, json.dumps(d))
    return d

if __name__ == '__main__':
    for p in sys.argv[1:]:
        a = load(p)
        m = cull(allpart(a), a.shape[1])
        summarize(shapes(m, a), p+' [allpart]')
