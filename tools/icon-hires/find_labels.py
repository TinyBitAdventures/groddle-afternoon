import json, os, re, subprocess, sys, glob
T = sys.argv[1]
J = '/opt/homebrew/opt/openjdk@21/bin/java'; F = os.path.expanduser('~/Documents/glitch-audit/tools/ffdec/ffdec.jar')
r = json.load(open(f'{T}/result.json')); m = json.load(open(f'{T}/map.json'))
icons = [os.path.basename(p)[:-4] for p in glob.glob(os.path.join(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'sprites', 'icons'), '*.png')) if '@' not in p]
want = {}  # icon id -> (swf path, label)
for i, _ in r['bad']:
    want[i] = (m[i], 'iconic')
for i in icons:
    if i.endswith('_broken') and i[:-7] in m:
        want[i] = (m[i[:-7]], 'broken_iconic')
def enc(b, p):
    v = 0; s = 0
    while True:
        x = b[p]; p += 1; v |= (x & 0x7f) << s; s += 7
        if not x & 0x80: return v, p
def strz(b, p):
    e = b.index(0, p); return b[p:e].decode('latin1'), e + 1
plan = {}
for i, (swf, label) in sorted(want.items()):
    out = subprocess.run([J, '-jar', F, '-dumpSWF', swf], capture_output=True, text=True).stdout
    g = re.search(r'DefineSceneAndFrameLabelData tagId= 86 len=\s*\d+\s+([0-9a-f ]+)', out)
    if not g: continue
    b = bytes(int(x, 16) for x in g.group(1).split())
    n, p = enc(b, 0); scenes = {}
    try:
        for _ in range(n):
            off, p = enc(b, p); name, p = strz(b, p); scenes[name] = off + 1
    except (ValueError, IndexError):
        pass
    if label in scenes: plan[i] = (swf, scenes[label])
json.dump(plan, open(f'{T}/plan2.json', 'w'), indent=0)
print(len(want), len(plan)); print({k: v[1] for k, v in plan.items()})
