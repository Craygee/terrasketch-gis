"""Stream public TxGIO parcels into bounded, spatially indexed FlatGeobuf parts."""
import hashlib
import json
import pathlib
import sys
import time

root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.release/parcel-python'))
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pyogrio
import pyproj
import shapely

store=root/'.data/texas-parcels'
source=json.loads((store/'current.json').read_text())
gdb=next((store/source['file'].removesuffix('.zip')).glob('*.gdb'))
out=store/'index'/source['sha256'][:16]
out.mkdir(parents=True,exist_ok=True)
transform=pyproj.Transformer.from_crs('EPSG:3857','EPSG:4326',always_xy=True)
parts=[]; count=0; missing_count=0; unmapped=[]; started=time.time()
with pyogrio.open_arrow(gdb,use_pyarrow=True,return_fids=True,batch_size=65536) as (meta,reader):
    if meta['crs']!='EPSG:3857': raise ValueError('Source CRS changed; review required')
    for index,batch in enumerate(reader):
        table=pa.Table.from_batches([batch])
        geom=shapely.from_wkb(table[meta['geometry_name']].to_pylist())
        missing=shapely.is_missing(geom)|shapely.is_empty(geom)
        if np.any(missing):
            missing_file=out/f'unmapped-{index:04d}.parquet'
            pq.write_table(table.filter(pa.array(missing)),missing_file)
            missing_count+=int(np.sum(missing))
            unmapped.append({'file':missing_file.name,'features':int(np.sum(missing)),'reason':'Source record has missing or empty geometry'})
            table=table.filter(pa.array(~missing)); geom=geom[~missing]
        if not table.num_rows: continue
        geom=shapely.transform(geom,transform.transform,interleaved=False)
        bounds=shapely.total_bounds(geom)
        if not np.isfinite(bounds).all(): raise ValueError('Invalid transformed bounds')
        table=table.set_column(table.schema.get_field_index(meta['geometry_name']),'geometry',pa.array(shapely.to_wkb(geom).tolist(),type=pa.binary()))
        file=out/f'part-{index:04d}.fgb'
        # Each part is immutable within a source version. A failed run can be rerun safely.
        pyogrio.write_arrow(table,file,driver='FlatGeobuf',geometry_name='geometry',geometry_type='MultiPolygon',crs='EPSG:4326')
        info=pyogrio.read_info(file,force_feature_count=True)
        if info['features']!=table.num_rows or info['crs']!='EPSG:4326': raise ValueError('Index verification failed')
        digest=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
        parts.append({'file':file.name,'bounds':bounds.tolist(),'features':table.num_rows,'bytes':file.stat().st_size,'sha256':digest})
        count+=table.num_rows
        if index%10==0: print(json.dumps({'parts':len(parts),'features':count,'seconds':round(time.time()-started)}),flush=True)
expected=json.loads((store/'geodatabase-info.json').read_text())['features']
if count+missing_count!=expected: raise ValueError(f'Incomplete index: {count}+{missing_count}/{expected}')
manifest={'schemaVersion':1,'sourceSha256':source['sha256'],'collectionId':source['collection']['collection_id'],'license':'CC0-1.0','sourceUrl':source['downloadUrl'],'sourceDate':source['collection']['acquisition_date'],'retrievedAt':source['downloadedAt'],'features':count,'unmappedFeatures':missing_count,'unmapped':unmapped,'countyCount':source['countyCount'],'missingCountyFips':source['missingCountyFips'],'crs':'EPSG:4326','parts':parts,'status':'indexed-not-yet-hosted'}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'status':manifest['status'],'features':count,'parts':len(parts),'bytes':sum(p['bytes'] for p in parts),'path':str(out)}),flush=True)
