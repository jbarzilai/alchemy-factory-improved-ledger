import mmap, os, struct, sys, subprocess
def env_values():
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    env_file = os.environ.get('AF_ENV_FILE') or os.path.join(repo, '.env')
    values = {}
    if env_file != 'none':
        try:
            with open(env_file, encoding='utf-8') as source:
                for line in source:
                    key, sep, value = line.strip().partition('=')
                    if not sep or key.startswith('#'):
                        continue
                    value = value.strip()
                    if value.startswith(("'", '"')):
                        quote = value[0]
                        end = value.find(quote, 1)
                        if end >= 0:
                            value = value[1:end]
                            if quote == '"':
                                value = value.replace('\\n', '\n').replace('\\r', '\r')
                    else:
                        value = value.split('#', 1)[0].strip()
                    values[key.strip()] = value
        except FileNotFoundError:
            pass
    return values

game_dir = os.environ.get('AF_GAME_DIR') or env_values().get('AF_GAME_DIR')
if not game_dir:
    sys.exit('AF_GAME_DIR is unset; run af-ledger bootstrap or set AF_GAME_DIR')
PAK = os.path.join(game_dir, 'AlchemyFactory', 'Content', 'Paks', 'AlchemyFactory-Windows.pak')

KDEC=os.environ.get('AF_KDEC') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../packages/core/native/bin/linux-x64/kdec')
f=open(PAK,'rb'); m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
L=len(m); tail=L-300; j=m.find(struct.pack('<I',0x5A6F12E1),tail)
ver,ioff,isz=struct.unpack_from('<IqQ',m,j+4)
methods=[m[j+4+4+8+8+20+i*32:j+4+4+8+8+20+(i+1)*32].split(b'\0')[0].decode() for i in range(5)]
def fstr(b,p):
    n=struct.unpack_from('<i',b,p)[0]; p+=4
    if n==0: return '',p
    if n>0: return b[p:p+n-1].decode('latin1'),p+n
    n=-n; return b[p:p+2*(n-1)].decode('utf-16le'),p+2*n
idx=m[ioff:ioff+isz]; p=0
mount,p=fstr(idx,p); n,=struct.unpack_from('<i',idx,p); p+=4; p+=8
has,=struct.unpack_from('<I',idx,p); p+=4
if has: p+=8+8+20
hasf,=struct.unpack_from('<I',idx,p); p+=4
fdo,fds=struct.unpack_from('<qq',idx,p); p+=8+8+20
esz,=struct.unpack_from('<i',idx,p); p+=4; enc=idx[p:p+esz]
fdi=m[fdo:fdo+fds]; q=0; nd,=struct.unpack_from('<i',fdi,q); q+=4; files={}
for _ in range(nd):
    d,q=fstr(fdi,q); nf,=struct.unpack_from('<i',fdi,q); q+=4
    for _ in range(nf):
        fn,q=fstr(fdi,q); loc,=struct.unpack_from('<i',fdi,q); q+=4; files[mount+d+fn]=loc
def entry(loc):
    b=enc; p=loc; v,=struct.unpack_from('<I',b,p); p+=4
    bs=(v&0x3f)<<11
    if (v&0x3f)==0x3f: bs,=struct.unpack_from('<I',b,p); p+=4
    nblk=(v>>6)&0xffff; encr=(v>>22)&1; meth=(v>>23)&0x3f
    if v>>31: off,=struct.unpack_from('<I',b,p); p+=4
    else: off,=struct.unpack_from('<Q',b,p); p+=8
    if (v>>30)&1: usz,=struct.unpack_from('<I',b,p); p+=4
    else: usz,=struct.unpack_from('<Q',b,p); p+=8
    csz=usz
    if meth:
        if (v>>29)&1: csz,=struct.unpack_from('<I',b,p); p+=4
        else: csz,=struct.unpack_from('<Q',b,p); p+=8
    sizes=[]
    if nblk>1 or (nblk==1 and encr):
        for _ in range(nblk): s,=struct.unpack_from('<I',b,p); p+=4; sizes.append(s)
    elif nblk==1: sizes=[csz]
    return dict(bs=bs,nblk=nblk,meth=meth,off=off,usz=usz,csz=csz,sizes=sizes)
def read(path):
    e=entry(files[path]); hdr=8+8+8+4+20+(4+16*e['nblk'] if e['meth'] else 0)+1+4
    pos=e['off']+hdr
    if not e['meth']: return m[pos:pos+e['usz']]
    out=[]; left=e['usz']
    for s in e['sizes']:
        u=min(e['bs'],left); left-=u
        out.append(subprocess.run([KDEC,'-','0',str(s),str(u)],input=m[pos:pos+s],capture_output=True,check=True).stdout); pos+=s
    return b''.join(out)
if __name__=='__main__':
    print('version',ver,'methods',methods,'files',len(files))
    for k in files:
        if k.endswith('.locres') or 'Localization' in k: print(k, entry(files[k])['usz'], entry(files[k])['meth'])
