"""Inspect the downloaded public archive without changing live infrastructure."""
import json
import pathlib
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / '.release/parcel-python'))
import pyogrio

data = root / '.data/texas-parcels'
manifest = json.loads((data / 'current.json').read_text())
target = data / manifest['file'].removesuffix('.zip')
target.mkdir(exist_ok=True)
if not (target / 'extraction-complete.json').exists():
    with zipfile.ZipFile(data / manifest['file']) as archive:
        for member in archive.infolist():
            destination = (target / member.filename).resolve()
            if not destination.is_relative_to(target.resolve()):
                raise ValueError('Unsafe archive path')
            archive.extract(member, target)
    (target / 'extraction-complete.json').write_text(json.dumps({'sha256': manifest['sha256']}))
gdbs = list(target.glob('*.gdb'))
if len(gdbs) != 1:
    raise ValueError('Unexpected statewide geodatabase layout')
layers = pyogrio.list_layers(gdbs[0])
print(layers.tolist(), flush=True)
for layer, geometry in layers:
    if not geometry:
        continue
    info = pyogrio.read_info(gdbs[0], layer=layer, force_feature_count=True)
    result = {key: info[key] for key in ['layer_name', 'crs', 'features', 'geometry_type', 'total_bounds']}
    print(json.dumps(result, default=lambda value: value.tolist()), flush=True)
    (data / 'geodatabase-info.json').write_text(json.dumps(result, default=lambda value: value.tolist(), indent=2))
