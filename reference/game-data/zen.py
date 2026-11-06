import struct, sys, re
def names(path):
    b=open(path,'rb').read()
    hasv,hsize=struct.unpack_from('<II',b,0)
    p=60
    if hasv: raise SystemExit('versioning info present')
    n,nbytes,hv=struct.unpack_from('<IIQ',b,p); p+=16
    p+=8*n
    lens=[struct.unpack_from('>H',b,p+2*i)[0] for i in range(n)]; p+=2*n
    out=[]
    for L in lens:
        wide=L&0x8000; L&=0x7fff
        if wide: s=b[p:p+2*L].decode('utf-16le'); p+=2*L
        else: s=b[p:p+L].decode('latin1'); p+=L
        out.append(s)
    return b,hsize,out
if __name__=='__main__':
    b,hsize,ns=names(sys.argv[1]); print('header',hsize,'names',len(ns)); print(ns[:40])
