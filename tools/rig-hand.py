# Rig the CC0 "Hand - Realistic" (Dan Ulrich, Blender Human Base Meshes v1.4.1,
# https://download.blender.org/demo/asset-bundles/human-base-meshes/) for the game:
#   blender -b human_base_meshes_bundle.blend --python tools/rig-hand.py -- public/hands
# Finds the joints by slicing the mesh (finger centrelines, lengths capped to anatomy), builds flat bones
# named wrist, <finger>-finger-metacarpal ... -tip and thumb-*, weights them automatically, and writes
# left.glb and right.glb (one is the mirror of the other).
import bpy, bmesh, numpy as np, mathutils, sys
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
src = bpy.data.objects['Hand  - Realistic']
# bake: multires and one subdivision into a plain mesh, in world space at the origin
for o in list(bpy.context.scene.objects): o.select_set(False)
md = src.modifiers.new('S', 'SUBSURF'); md.levels = 1; md.render_levels = 1
me = bpy.data.meshes.new_from_object(src.evaluated_get(bpy.context.evaluated_depsgraph_get()))
base = bpy.data.objects.new('hand', me); bpy.context.scene.collection.objects.link(base)
for p in me.polygons: p.use_smooth = True
co = np.array([v.co[:] for v in me.vertices])
print('verts', len(co))

def slab(axis, v, half=0.0007): return co[np.abs(co[:, axis] - v) < half]
def split(pts, axis, gap=0.0025):
    if len(pts) == 0: return []
    pts = pts[np.argsort(pts[:, axis])]
    out, cur = [], [pts[0]]
    for p in pts[1:]:
        if p[axis] - cur[-1][axis] > gap: out.append(np.array(cur)); cur = [p]
        else: cur.append(p)
    out.append(np.array(cur)); return out

# --- fingers: slices across z (fingers point -z), columns in x (thumb at +x is excluded)
CENTRES = {'pinky': -0.05, 'ring': -0.015, 'middle': 0.015, 'index': 0.047}
tracks = {k: [] for k in CENTRES}
for z in np.arange(co[:, 2].min() + 0.001, -0.08, 0.001):
    cs = [c for c in split(slab(2, z), 0) if c[:, 0].mean() < 0.068]
    if len(cs) < 2: continue
    for c in cs:
        if np.ptp(c[:, 0]) > 0.026: continue
        k = min(CENTRES, key=lambda n: abs(CENTRES[n] - c[:, 0].mean()))
        if abs(CENTRES[k] - c[:, 0].mean()) < 0.014: tracks[k].append((c[:, 0].mean(), (c[:, 1].min() + c[:, 1].max()) / 2, z))
HAND = 0.175  # wrist crease to the tip of the middle finger
J = {}
for k, t in tracks.items():
    t = np.array(t)
    tipz = co[(np.abs(co[:, 0] - t[0, 0]) < 0.008)][:, 2].min()
    # keep the run that is contiguous from the tip
    run = [t[0]]
    for p in t[1:]:
        if p[2] - run[-1][2] > 0.0035: break
        run.append(p)
    run = np.array(run)
    web = run[-1]
    # the centreline as traced, from the tip; past the web it carries on the way its lower third runs
    tipz = min(tipz, run[0][2])
    # smooth the slices' jitter: x and y as quadratics in z
    cx = np.polyfit(run[:, 2], run[:, 0], 2); cy = np.polyfit(run[:, 2], run[:, 1], 2)
    zs = np.linspace(tipz, run[-1][2], 40)
    run = np.stack([np.polyval(cx, zs), np.polyval(cy, zs), zs], 1)
    path = [p for p in run]
    low = run[len(run) * 2 // 3:]
    d = low[-1] - low[0]; d = d / np.linalg.norm(d)
    seglen = lambda P: np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    Lt = {'index': 0.49, 'middle': 0.54, 'ring': 0.51, 'pinky': 0.40}[k] * HAND * 1.04
    arc = seglen(np.array(path))
    if arc[-1] < Lt: path.append(path[-1] + d * (Lt - arc[-1]))
    P = np.array(path); arc = seglen(P); L = min(arc[-1], Lt)
    at = lambda a: np.array([np.interp(a, arc, P[:, i]) for i in range(3)])  # a = distance from the tip
    tip, mcp = P[0], at(L)
    J[k] = dict(tip=tip, mcp=mcp, pip=at(L * 0.53), dip=at(L * 0.24))
    print(k, 'tip', tip.round(3), 'mcp', mcp.round(3), 'len', round(L, 3), 'web z', round(web[2], 3))
# wrist: centre of the cross-section where the hand meets the forearm
wz = -0.03; s = slab(2, wz, 0.002)
wrist = np.array([s[:, 0].mean(), (s[:, 1].min() + s[:, 1].max()) / 2, wz])
# --- thumb: slices across x (it points +x), beyond the index finger
th = []
for x in np.arange(co[:, 0].max() - 0.001, 0.05, -0.001):
    cs = [c for c in split(slab(0, x), 2) if c[:, 2].mean() < -0.055]
    if not cs: continue
    c = max(cs, key=lambda c: c[:, 2].mean() if False else -abs(c[:, 2].mean() + 0.095))
    th.append((x, (c[:, 1].min() + c[:, 1].max()) / 2, c[:, 2].mean()))
th = np.array(th)
ttip = th[0].copy(); ttip[0] = co[:, 0].max() - 0.004
tbase = np.array([0.03, wrist[1], -0.045])  # the root of the thumb, at the heel of the palm
tm = th[min(len(th) - 1, int(len(th) * 0.75))]
J['thumb'] = dict(cmc=tbase, mcp=tm, ip=tm + (ttip - tm) * 0.5, tip=ttip)
print('thumb', {k: v.round(3).tolist() for k, v in J['thumb'].items()}, 'wrist', wrist.round(3))
# which side is the palm: the fingers' tips lean to it
lean = np.mean([J[k]['tip'][1] - J[k]['mcp'][1] for k in CENTRES])
print('palm side y sign', np.sign(lean), 'lean', round(lean, 4))

def build(mesh_obj, J, wrist, name):
    arm = bpy.data.armatures.new(name + '-arm'); ao = bpy.data.objects.new(name + '-rig', arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao; ao.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(n, h, t):
        b = arm.edit_bones.new(n); b.head = mathutils.Vector(h); b.tail = mathutils.Vector(t)
        if (b.tail - b.head).length < 1e-4: b.tail = b.head + mathutils.Vector((0, 0, -0.005))
    bone('wrist', wrist, wrist + np.array([0, 0, 0.06]))
    for k in CENTRES:
        n = 'pinky' if k == 'pinky' else k
        f = J[k]; pre = f'{n}-finger-'
        bone(pre + 'metacarpal', wrist + (f['mcp'] - wrist) * 0.15, f['mcp'])
        bone(pre + 'phalanx-proximal', f['mcp'], f['pip'])
        bone(pre + 'phalanx-intermediate', f['pip'], f['dip'])
        bone(pre + 'phalanx-distal', f['dip'], f['tip'])
        bone(pre + 'tip', f['tip'], f['tip'] + (f['tip'] - f['dip']) * 0.2)
    t = J['thumb']
    bone('thumb-metacarpal', t['cmc'], t['mcp'])
    bone('thumb-phalanx-proximal', t['mcp'], t['ip'])
    bone('thumb-phalanx-distal', t['ip'], t['tip'])
    bone('thumb-tip', t['tip'], t['tip'] + (t['tip'] - t['ip']) * 0.2)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.scene.objects: o.select_set(False)
    mesh_obj.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    counts = {g.name: 0 for g in mesh_obj.vertex_groups}
    for v in mesh_obj.data.vertices:
        for g in v.groups:
            if g.weight > 0.5: counts[mesh_obj.vertex_groups[g.group].name] += 1
    print('WEIGHTS', name, counts)
    return ao

def export(objs, path):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_skins=True, export_animations=False, export_materials='NONE', export_yup=True, export_texcoords=False)

# --- the two hands: this mesh is one, the other its mirror; the other is its mirror
mir = base.copy(); mir.data = base.data.copy(); bpy.context.scene.collection.objects.link(mir)
bm = bmesh.new(); bm.from_mesh(mir.data)
for v in bm.verts: v.co.x = -v.co.x
bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(mir.data); bm.free()
M = lambda p: p * np.array([-1, 1, 1])
Jm = {k: {kk: M(vv) for kk, vv in v.items()} for k, v in J.items()}
# the fingertips lean toward the palm; with the thumb at +x and fingers at -z, a palm at +y is a right hand
src_side = 'left' if lean < 0 else 'right'
print('SOURCE SIDE', src_side)
a1 = build(base, J, wrist, src_side); a2 = build(mir, Jm, M(wrist), 'other')
other = 'right' if src_side == 'left' else 'left'
export([base, a1], f'{OUT}/{src_side}.glb'); export([mir, a2], f'{OUT}/{other}.glb')
print('DONE')
