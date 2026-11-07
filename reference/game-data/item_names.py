# Item ID -> English name, from the game install (read-only). Run from this directory after extracting
# DT_Enemies with: mkdir -p ../../.cache/dt && node extract.mjs <AlchemyFactory-Windows.utoc> DataTables/DT_Enemies.uasset ../../.cache/dt/DT_Enemies.uasset
# Usage: python3 -B item_names.py ../../.cache/dt/DT_Enemies.uasset > ../../.cache/item-names.json (see README.md)
import json, re, struct, sys
import pak, zen

def locres(data):
    def fstr(p):
        n = struct.unpack_from('<i', data, p)[0]; p += 4
        if n == 0: return '', p
        if n > 0: return data[p:p + n - 1].decode('latin1'), p + n
        n = -n; return data[p:p + 2 * (n - 1)].decode('utf-16le'), p + 2 * n
    p = 16; ver = data[p]; p += 1; stroff = struct.unpack_from('<q', data, p)[0]; p += 8
    if ver >= 2: p += 4
    nns = struct.unpack_from('<I', data, p)[0]; p += 4; ent = {}
    for _ in range(nns):
        if ver >= 2: p += 4
        ns, p = fstr(p); nk = struct.unpack_from('<I', data, p)[0]; p += 4
        for _ in range(nk):
            if ver >= 2: p += 4
            k, p = fstr(p); p += 4; ent[k] = struct.unpack_from('<i', data, p)[0]; p += 4
    q = stroff; cnt = struct.unpack_from('<i', data, q)[0]; q += 4; strs = []
    for _ in range(cnt):
        s, q = fstr(q)
        if ver >= 3: q += 4
        strs.append(s)
    return {k: strs[i] for k, i in ent.items()}

en = locres(pak.read('../../../AlchemyFactory/Content/Localization/Game/en/Game.locre'))  # pak.py drops the last char of file names
b, h, names = zen.names(sys.argv[1])
data = b[h:]
is_item = lambda i: i < len(names) and re.fullmatch(r'[A-Z][A-Za-z0-9]*', names[i])
out = {}
# Each row's FText (string-table key FString) sits 35 bytes after the row FName (71 for a few rows).
for m in re.finditer(rb'(Ingredient_Name_[A-Za-z0-9_]+)\x00', data):
    for dist in (35, 71):
        idx, num = struct.unpack_from('<II', data, m.start() - dist)
        if num == 0 and is_item(idx):
            out[names[idx]] = en.get(m.group(1).decode(), m.group(1).decode()); break
json.dump(dict(sorted(out.items())), sys.stdout, indent=1, ensure_ascii=False)
