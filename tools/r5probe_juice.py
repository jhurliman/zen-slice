import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi

def load(p):
    im = Image.open(p).convert('RGB')
    a = np.asarray(im).astype(np.float32)/255.0
    return a

def lum(a):
    return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]

def sat(a):
    mx = a.max(2); mn = a.min(2)
    return np.where(mx>1e-6, (mx-mn)/np.maximum(mx,1e-6), 0.0)

S8 = np.ones((3,3), bool)

def disk(r):
    y,x = np.mgrid[-r:r+1, -r:r+1]
    return (x*x+y*y) <= r*r

def stats(mask, a, labels=None):
    L = lum(a); S = sat(a)
    lab, n = ndi.label(mask, structure=S8)
    if n == 0: return None
    areas = ndi.sum(mask, lab, range(1, n+1))
    px = int(mask.sum())
    med = float(np.median(areas))
    f4 = float((areas<=4).sum())/n
    f16 = float((areas>=16).sum())/n
    sv = S[mask]
    return dict(n=n, px=px, medAreaPx=med, frac_le4=round(100*f4,1),
                frac_ge16=round(100*f16,1),
                sat_ge045=round(100*float((sv>=0.45).mean()),1),
                meanSat=round(float(sv.mean()),3))

def free_droplets(a, thr=0.06):
    L = lum(a)
    m = L > thr
    lab, n = ndi.label(m, structure=S8)
    objs = ndi.find_objects(lab)
    W = a.shape[1]
    keep = np.zeros(n+1, bool)
    areas = ndi.sum(m, lab, range(1, n+1))
    for i, sl in enumerate(objs):
        w = sl[1].stop - sl[1].start
        if w > 0.35*W: continue
        if areas[i] > 1500: continue
        keep[i+1] = True
    return keep[lab]

def body_mask(a):
    L = lum(a)
    b = ndi.binary_opening(L > 0.15, structure=disk(11))
    lab, n = ndi.label(b, structure=S8)
    if n == 0: return np.zeros_like(b)
    areas = ndi.sum(b, lab, range(1, n+1))
    big = int(np.argmax(areas))+1
    return ndi.binary_dilation(lab == big, structure=disk(6))

def allpart(a, hp=0.030):
    L = lum(a)
    g = ndi.gaussian_filter(L, 5)
    m = (L - g) > hp
    m &= ~body_mask(a)
    return m

if __name__ == '__main__':
    for p in sys.argv[1:]:
        a = load(p)
        print(p)
        print('  free  ', stats(free_droplets(a), a))
        print('  allpar', stats(allpart(a), a))
