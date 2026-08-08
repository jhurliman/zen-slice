#!/usr/bin/env python3
"""r5 check (a): cut-face clipping + G/R.

Method, reproduced from the r4 fruit-mat verdict's own description:
  flesh mask = R>55 & G<0.80R & B<0.80R, largest connected component INSIDE a
  fixed absolute window over the exposed (lower, key-lit) cut face; 2nd-moment
  ellipse fit; inner-0.55 = Mahalanobis radius <= 0.55 of the mask's p97 radius.
The same window is used on r3/r4/r4b/r5 so the deltas are like-for-like.
Citrus probe is the verdict's verbatim one (largest lum>45 component) and
reproduces its r4 numbers to 0.1.
"""
import os, numpy as np
from PIL import Image
from scipy import ndimage

def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float64)
def lum(a): return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]

def flesh_mask(a):
    R,G,B = a[...,0],a[...,1],a[...,2]
    return (R>55.0)&(G<0.80*R)&(B<0.80*R)

def largest_cc(m):
    lab,n = ndimage.label(m, structure=np.ones((3,3)))
    if n==0: return None,0
    sizes = ndimage.sum(m,lab,range(1,n+1))
    i = int(np.argmax(sizes))+1
    return lab==i, sizes[i-1]

def inner(mask, frac=0.55):
    ys,xs = np.nonzero(mask)
    cy,cx = ys.mean(), xs.mean()
    dy,dx = ys-cy, xs-cx
    C = np.cov(np.vstack([dx,dy])); Ci = np.linalg.inv(C)
    r = np.sqrt(np.maximum(Ci[0,0]*dx*dx + 2*Ci[0,1]*dx*dy + Ci[1,1]*dy*dy, 0))
    r = r/np.percentile(r,97.0)
    sel = r<=frac
    out = np.zeros_like(mask); out[ys[sel],xs[sel]] = True
    return out

def stats(a, mask, label):
    px = a[mask]
    if len(px)==0: print(f'{label:30s} EMPTY'); return None
    mean = px.mean(axis=0)
    d = dict(n=int(len(px)), mean=[round(float(v),1) for v in mean],
             R255=round(float((px[...,0]>=255).mean()*100),2),
             GR=round(float(mean[1]/mean[0]),3), BR=round(float(mean[2]/mean[0]),3),
             lumMed=round(float(np.median(lum(px[None])[0])),1))
    print(f'{label:30s} n={d["n"]:7d} mean={str(d["mean"]):24s} R>=255 {d["R255"]:6.2f}%  G/R {d["GR"]:.3f}  B/R {d["BR"]:.3f}  lumMed {d["lumMed"]:6.1f}')
    return d

def face(path, label, box):
    a = load(path); m = flesh_mask(a)
    y0,y1,x0,x1 = box
    k = np.zeros(m.shape,bool); k[y0:y1,x0:x1]=True
    m2,_ = largest_cc(m&k)
    if m2 is None: print(f'{label}: none'); return None
    return stats(a, inner(m2), label)

def citrus(path,label):
    a = load(path); m2,_ = largest_cc(lum(a)>45)
    return stats(a,m2,label)

WIN = (208,300,288,392)          # lower/key-lit melon cut face, 640x360 frames
PLATE = (320,565,545,805)        # plate-01 watermelon cut face, above the sheet

if __name__=='__main__':
    out={}
    print('=== (a1) WATERMELON key-lit cut face, inner-0.55, 05-cut+500ms ===')
    for r in ['r3','r4','r4b','r5']:
        p=f'/home/claude/juice/shots/{r}/05-cut+500ms.png'
        if os.path.exists(p): out[r]=face(p,f'{r}/05 lit cut face',WIN)
    out['plate']=face('/home/claude/juice/reference/plate-01.png','plate-01 melon face',PLATE)
    print()
    print('=== (a2) CITRUS near half incl. peel, 08-citrus-caps (verdict probe) ===')
    for r in ['r3','r4','r4b','r5']:
        p=f'/home/claude/juice/shots/{r}/08-citrus-caps.png'
        if os.path.exists(p): out['c'+r]=citrus(p,f'{r}/08 citrus half')
    a=load('/home/claude/juice/reference/plate-02-highspeed-citrus.jpeg')
    m,_=largest_cc(lum(a)>45); stats(a,m,'plate-02 lemon body')
