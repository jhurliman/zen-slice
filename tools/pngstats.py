# pngstats.py — hue / saturation / value summary of a PNG's foreground pixels,
# no dependencies. Used with tools/pineloop.mjs against the reference photo.
#   python3 tools/pngstats.py <png> [y0 y1] [dark|white]   (y0,y1: row range as
#   fractions; 'dark' skips the black void, 'white' skips a product-shot ground)
import struct,zlib,sys,colorsys,statistics as st
def readpng(p):
    d=open(p,'rb').read(); pos=8; idat=b''
    while pos<len(d):
        l=struct.unpack('>I',d[pos:pos+4])[0]; t=d[pos+4:pos+8]; c=d[pos+8:pos+8+l]; pos+=12+l
        if t==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',c[:10])
        elif t==b'IDAT': idat+=c
    raw=zlib.decompress(idat); bpp={2:3,6:4,0:1,4:2}[ct]; stride=w*bpp; rows=[]; prev=bytearray(stride); i=0
    for y in range(h):
        f=raw[i]; i+=1; line=bytearray(raw[i:i+stride]); i+=stride
        for x in range(stride):
            a=line[x-bpp] if x>=bpp else 0; b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b)&255
            elif f==3: line[x]=(line[x]+(a+b)//2)&255
            elif f==4:
                p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
                line[x]=(line[x]+(a if pa<=pb and pa<=pc else b if pb<=pc else c))&255
        rows.append(bytes(line)); prev=line
    return w,h,bpp,rows
def stats(p, y0=0.0, y1=1.0, bg='dark', step=2):
    w,h,bpp,rows=readpng(p); hs=[];ss=[];vs=[];lum=[]
    for y in range(int(h*y0),int(h*y1),step):
        r=rows[y]
        for x in range(0,w,step):
            px=r[x*bpp:x*bpp+bpp]; R,G,B=px[0],px[1],px[2]; A=px[3] if bpp==4 else 255
            if A<200: continue
            if bg=='dark' and R+G+B<60: continue
            if bg=='white' and R>235 and G>235 and B>235: continue
            hh,s,v=colorsys.rgb_to_hsv(R/255,G/255,B/255); hs.append(hh*360); ss.append(s); vs.append(v)
    if not hs: return None
    q=lambda a,f: sorted(a)[int(len(a)*f)]
    return dict(px=len(hs), hue=round(st.median(hs),1), hue10=round(q(hs,.1),1), hue90=round(q(hs,.9),1), sat=round(st.median(ss),2), val=round(st.median(vs),2), val10=round(q(vs,.1),2), val90=round(q(vs,.9),2))
if __name__=='__main__':
    p=sys.argv[1]; y0=float(sys.argv[2]) if len(sys.argv)>2 else 0; y1=float(sys.argv[3]) if len(sys.argv)>3 else 1; bg=sys.argv[4] if len(sys.argv)>4 else 'dark'
    print(p.split('/')[-1], stats(p,y0,y1,bg))
