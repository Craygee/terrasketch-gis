import pathlib,sys,json
sys.path.insert(0,'.release/parcel-python')
import pyogrio,pyproj,shapely
root=pathlib.Path('.data/texas-parcels');source=json.loads((root/'current.json').read_text());gdb=next((root/source['file'].removesuffix('.zip')).glob('*.gdb'))
transform=pyproj.Transformer.from_crs(4326,3857,always_xy=True)
rows=[{'name':name,'bbox':b,'ids':[]} for name,b in [('Austin',[-97.751,30.265,-97.74,30.275]),('San Antonio',[-98.5,29.42,-98.49,29.43]),('El Paso',[-106.49,31.75,-106.48,31.76]),('Rural west Texas',[-104.7,30.7,-104.69,30.71])]]
projected=[transform.transform_bounds(*r['bbox']) for r in rows]
# Do not rely on the publisher geodatabase's embedded spatial index, which returns false empty results.
with pyogrio.open_arrow(gdb,use_pyarrow=True,return_fids=True,columns=['COUNTY'],batch_size=65536) as (meta,reader):
 for index,batch in enumerate(reader):
  geom=shapely.from_wkb(batch[meta['geometry_name']].to_pylist());bounds=shapely.bounds(geom);ids=batch['OBJECTID'].to_numpy()
  for row,b in zip(rows,projected):
   mask=(bounds[:,0]<=b[2])&(bounds[:,2]>=b[0])&(bounds[:,1]<=b[3])&(bounds[:,3]>=b[1]);row['ids'].extend(ids[mask].tolist())
  if index%50==0:print('Source scan batch',index,flush=True)
(root/'validation-areas.json').write_text(json.dumps(rows))
print(json.dumps([{r['name']:len(r['ids'])} for r in rows]),flush=True)
