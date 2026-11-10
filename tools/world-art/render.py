"""Render the art an item shows when it is put down in a place (a dropped stack) from its SWF.

    python3 -I tools/world-art/render.py [--work DIR] [--force] [id ...]
    python3 -I tools/world-art/render.py --list     # rewrite public/js/world-art-list.js from art.json

The original drew a stack in a location in the state named by its count, not
its pack icon (glitch-client ItemstackState.as getDefaultStrForStack 202-209:
'iconic' only in a pack, else String(itemstack.count)). The SWF plays the scene
of that name; a count with no scene of its own plays the highest numbered scene
(AbstractItemstackView.as animateMC 339-356, MCUtil.getHighestCountSceneName
95-109), and the default scene is '1' (ItemSSManager.as:28). The view puts the
SWF's stage bottom centre on the stack's point at the movie's own size
(LocationItemstackView.as _positionViewDO 853-854, _itemstack.scale 1), so a
stack rests on the line under it.

For every pack icon (public/assets/sprites/icons/<id>.webp) with a SWF of the same
name in tinyspeck/glitch-items (CC0) whose class can be put down (its GameServerJS
item file has a drop verb, items/include/takeable.js), each numbered scene's first frame is
exported by FFDec at zoom 3 (the stage padded on every side, as
tools/icon-hires/swfinfo.rewrite does, so art drawn past the stage is kept),
trimmed, and written as public/assets/sprites/world/<id>/<n>@3x.webp
(js/textures.js reads the 3 from the name). A SWF with no numbered scene (trees,
boards, a few toys) renders its first frame as '1'. art.json records each
state's 1x size and where the art sits against the stage's bottom centre
(`dx`: the art's centre right of it, `lift`: the art's bottom above it, both at 1x),
the SWF's hash and its path in glitch-items (`swf`); unchanged ids are skipped unless --force.
Only the item folders count: glitch-items/achievements is badge art (NOT_ITEMS). Ids that can't be
put down are left out, and their old renders removed.
"""
import glob, hashlib, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.normpath(os.path.join(HERE, '../..'))
sys.path.insert(0, os.path.join(SPIKE, 'tools/icon-hires'))
import swfinfo  # noqa: E402

ICONS = os.path.join(SPIKE, 'public/assets/sprites/icons')
OUT = os.path.join(SPIKE, 'public/assets/sprites/world')
ART = os.path.join(HERE, 'art.json')
LIST_JS = os.path.join(SPIKE, 'public/js/world-art-list.js')
ITEMS = os.path.expanduser('~/Documents/glitch-audit/glitch-items')
GSJS = os.path.expanduser('~/Documents/glitch-audit/eleven-gsjs/items')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from java_path import JAVA  # noqa: E402  (tools/java_path.py: $GRODDLE_JAVA, else the first Homebrew JDK)
FFDEC = os.path.expanduser('~/Documents/glitch-audit/tools/ffdec/ffdec.jar')
ZOOM = 3
BATCH = 60
# The client's count states run 1, 2, 3 ... (apple 1-4, plank 1-5); more than this is never drawn apart.
MAX_STATES = 12


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def trim_box(path):
    out = subprocess.run(['magick', path, '-format', '%@', 'info:'], capture_output=True, text=True).stdout.strip()
    w, rest = out.split('x', 1)
    h, x, y = rest.replace('+', ' ').split()
    return int(w), int(h), int(x), int(y)


def guard():
    load = os.getloadavg()[0]
    free = shutil.disk_usage(os.path.expanduser('~')).free / 1e9
    if free < 4:
        sys.exit(f'stop: {free:.1f} GB free')
    return load


def icon_ids():
    return sorted({os.path.basename(p)[:-5] for p in glob.glob(os.path.join(ICONS, '*.webp')) if '@' not in os.path.basename(p)})


# Not an item's art: glitch-items/achievements holds the badges (one SWF per achievement), and 11
# badges share their name with an item (card_carrying_qualification, the ten artifact_* pieces), so
# a put-down Card-Carrying Qualification drew its badge (player report 35). An item's own SWF is in
# the item folders (misc/<class>/<class>.swf, artifacts/<class>/<class>.swf, food/..., ...).
NOT_ITEMS = ('achievements',)


def swf_index():
    """{name: path}: each item SWF by its file name, from the item folders only (never a badge).

    A few SWFs are not named for their class but sit alone in a folder that is: Fiber is
    misc/fiber/strips_of_fabric.swf, the herb seeds seeds/herb_seed_<herb>/seed_<herb>.swf, the
    butterfly hair clip pieces artifacts/artifact_butterfly_hair_clip_piece<n>/artifact_butterlfy_...
    (misspelt in the original). A class with no SWF of its own name takes the one SWF in the folder
    of its name (lane refsart, register G646: these 12 lay on the ground as their pack icons).
    """
    idx = {}
    by_folder = {}
    for p in sorted(glob.glob(os.path.join(ITEMS, '**/*.swf'), recursive=True)):
        if os.path.relpath(p, ITEMS).split(os.sep)[0] in NOT_ITEMS:
            continue
        idx.setdefault(os.path.basename(p)[:-4], p)
        by_folder.setdefault(os.path.basename(os.path.dirname(p)), []).append(p)
    for folder, paths in by_folder.items():
        if folder not in idx and len(paths) == 1:
            idx[folder] = paths[0]
    return idx


def droppable(key):
    """The class has a drop verb (items/include/takeable.js verbs.drop), so it can lie in a place as a stack."""
    path = os.path.join(GSJS, f'{key}.js')
    return os.path.exists(path) and 'verbs.drop' in open(path, encoding='utf-8', errors='replace').read()


def prune(art):
    """Drop ids that can't be put down, and any render folder art.json doesn't list."""
    for key in [k for k in art if not droppable(k)]:
        art.pop(key)
    if os.path.isdir(OUT):
        for name in os.listdir(OUT):
            if name not in art:
                shutil.rmtree(os.path.join(OUT, name), ignore_errors=True)
            else:
                for f in os.listdir(os.path.join(OUT, name)):
                    if f.split('@')[0] not in art[name]['states']:
                        os.remove(os.path.join(OUT, name, f))


def states_of(info):
    """[(state name, frame)]: the numbered scenes (1, 2, ...), else frame 1 as '1'."""
    scenes = info.get('scenes') or {}
    nums = sorted((int(k), v) for k, v in scenes.items() if k.isdigit() and int(k) >= 1)
    if not nums:
        return [('1', 1)]
    return [(str(n), f) for n, f in nums[:MAX_STATES]]


def write_list(art):
    rows = []
    for key in sorted(art):
        st = art[key]['states']
        cells = ', '.join(f"{json.dumps(n)}: [{v['w']}, {v['h']}]" for n, v in st.items())
        rows.append(f'  {json.dumps(key)}: {{ {cells} }},')
    text = (
        '/**\n'
        ' * Generated by tools/world-art/render.py from the tinyspeck/glitch-items SWFs (CC0). Do not edit by hand.\n'
        ' *\n'
        ' * WORLD_ART[icon id][state] = [w, h] at 1x: the art a stack shows when it is put down (the scene\n'
        ' * named by its count), drawn from public/assets/sprites/world/<id>/<state>@3x.webp with its bottom\n'
        ' * centre on the stack\'s point.\n'
        ' */\n'
        'export const WORLD_ART = Object.freeze({\n' + '\n'.join(rows) + '\n});\n'
    )
    open(LIST_JS, 'w').write(text)


def main(args):
    if '--list' in args:
        write_list(json.load(open(ART)))
        return
    force = '--force' in args
    work = args[args.index('--work') + 1] if '--work' in args else None
    only = [a for a in args if not a.startswith('--') and a != work]
    art = json.load(open(ART)) if os.path.exists(ART) else {}
    idx = swf_index()
    todo = []
    for key in icon_ids():
        if only and key not in only:
            continue
        src = idx.get(key)
        if not src or not droppable(key):
            continue
        digest = sha(src)
        if not force and art.get(key, {}).get('sha') == digest and all(
            os.path.exists(os.path.join(OUT, key, f'{n}@{ZOOM}x.webp')) for n in art[key]['states']
        ):
            art[key] = {'sha': digest, 'swf': os.path.relpath(src, ITEMS), 'states': art[key]['states']}
            continue
        try:
            info = swfinfo.read(src)
        except Exception as e:  # noqa: BLE001
            print('  unreadable', key, e)
            continue
        todo.append((key, src, digest, info, states_of(info)))
    work = work or tempfile.mkdtemp(prefix='worldart-')
    os.makedirs(work, exist_ok=True)
    print(f'{len(todo)} to render in {work}')
    # FFDec's -select applies to every SWF of a run: group the SWFs by the frames they need.
    groups = {}
    for row in todo:
        frames = ','.join(str(f) for _, f in row[4])
        groups.setdefault(frames, []).append(row)
    done = 0
    for frames, rows in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        for b in range(0, len(rows), BATCH):
            while guard() > 40:
                print('load above 40, waiting')
                subprocess.run(['sleep', '60'])
            batch = rows[b:b + BATCH]
            tag = f'{abs(hash(frames)) % 10**8}-{b}'
            src_dir = os.path.join(work, f'src{tag}')
            out_dir = os.path.join(work, f'out{tag}')
            os.makedirs(src_dir, exist_ok=True)
            for key, src, *_ in batch:
                swfinfo.rewrite(src, os.path.join(src_dir, f'{key}.swf'), pad=1.0)
            subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, '-zoom', str(ZOOM), '-ignorebackground',
                            '-select', frames, '-format', 'frame:png', '-export', 'frame', out_dir, src_dir],
                           capture_output=True, text=True)
            for key, src, digest, info, states in batch:
                x0, x1, y0, y1 = info['rect']
                # The padded stage starts one stage size left of and above the authored one.
                foot_x = (x1 - x0) * 1.5 * ZOOM
                foot_y = (y1 - y0) * 2 * ZOOM
                out = {}
                for name, frame in states:
                    png = os.path.join(out_dir, f'{key}.swf', f'{frame}.png')
                    if not os.path.exists(png):
                        continue
                    w, h, x, y = trim_box(png)
                    if w < 3 or h < 3:
                        continue
                    W, H = w + (-w % ZOOM), h + (-h % ZOOM)
                    dst = os.path.join(OUT, key, f'{name}@{ZOOM}x.webp')
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    tmp = os.path.join(work, 'tmp.png')
                    subprocess.run(['magick', png, '-crop', f'{w}x{h}+{x}+{y}', '+repage', '-background', 'none',
                                    '-gravity', 'South', '-extent', f'{W}x{H}', '-strip', tmp], check=True)
                    subprocess.run(['cwebp', '-quiet', '-metadata', 'none', '-q', '88', '-m', '4', '-sharp_yuv',
                                    '-alpha_q', '100', '-alpha_filter', 'best', tmp, '-o', dst], check=True)
                    out[name] = {
                        'w': W // ZOOM,
                        'h': H // ZOOM,
                        'dx': round((x + w / 2 - foot_x) / ZOOM),
                        'lift': round((foot_y - (y + h)) / ZOOM),
                    }
                if out:
                    art[key] = {'sha': digest, 'swf': os.path.relpath(src, ITEMS), 'states': out}
                else:
                    print('  no render', key)
                    art.pop(key, None)
            shutil.rmtree(src_dir, ignore_errors=True)
            shutil.rmtree(out_dir, ignore_errors=True)
            done += len(batch)
            print(f'  {done}/{len(todo)}')
            json.dump(dict(sorted(art.items())), open(ART, 'w'), indent=1)
            open(ART, 'a').write('\n')
    prune(art)
    json.dump(dict(sorted(art.items())), open(ART, 'w'), indent=1)
    open(ART, 'a').write('\n')
    write_list(art)
    print(f'{len(art)} in art.json')


if __name__ == '__main__':
    main(sys.argv[1:])
