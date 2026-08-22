import type { CatalogItem } from '../types'

export const DATA_CATALOG: CatalogItem[] = [
  {
    id: 'txdot-roadways', name: 'TxDOT roadways', provider: 'TxDOT', category: 'Transportation',
    description: 'Statewide roadway centerlines with public planning and asset-inventory attributes.', color: '#475569', tags: ['texas', 'road', 'highway', 'txdot', 'transportation'],
    serviceUrl: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer', layerId: 0,
  },
  {
    id: 'txdot-aadt', name: 'TxDOT annual average daily traffic', provider: 'TxDOT', category: 'Transportation',
    description: 'TxDOT roadway segments attributed with annual average daily traffic.', color: '#ea580c', tags: ['texas', 'traffic', 'aadt', 'road', 'txdot'],
    serviceUrl: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT/FeatureServer', layerId: 0,
  },
  {
    id: 'txdot-counties', name: 'Texas county boundaries', provider: 'TxDOT', category: 'Transportation',
    description: 'Official TxDOT county boundary linework.', color: '#7c3aed', tags: ['texas', 'county', 'boundary', 'txdot'],
    serviceUrl: 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/Texas_County_Boundaries_Line/FeatureServer', layerId: 0,
  },
  {
    id: 'hifld-transmission', name: 'Electric transmission lines', provider: 'HIFLD / ORNL', category: 'Energy',
    description: 'Public national electric transmission line inventory.', color: '#dc2626', tags: ['electric', 'power', 'utility', 'line'],
    serviceUrl: 'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services/HIFLD_electric_power_transmission_lines/FeatureServer', layerId: 7,
  },
  {
    id: 'eia-gas-pipelines', name: 'Major natural gas pipelines', provider: 'U.S. Energy Information Administration', category: 'Energy',
    description: 'Major interstate, intrastate, and gathering natural-gas transmission pipelines.', color: '#a16207', tags: ['gas', 'pipeline', 'energy', 'utility'],
    serviceUrl: 'https://services.arcgis.com/2gdL2gxYNFY2TOUb/ArcGIS/rest/services/NaturalGas_Pipelines_US_Dissolved/FeatureServer', layerId: 0,
  },
  {
    id: 'glo-psf', name: 'Permanent School Fund lands', provider: 'Texas General Land Office', category: 'Land',
    description: 'Texas GLO-managed Permanent School Fund land polygons.', color: '#16a34a', tags: ['glo', 'public land', 'survey', 'texas'],
    serviceUrl: 'https://services1.arcgis.com/YWG34dhJxrbxQWdF/arcgis/rest/services/Permanent_School_Fund_Lands/FeatureServer', layerId: 0,
  },
  {
    id: 'glo-leases', name: 'GLO upland leases', provider: 'Texas General Land Office', category: 'Land',
    description: 'Public upland lease records from the Texas GLO.', color: '#0891b2', tags: ['lease', 'glo', 'land'],
    serviceUrl: 'https://services1.arcgis.com/YWG34dhJxrbxQWdF/ArcGIS/rest/services/Upland_Leases/FeatureServer', layerId: 0,
  },
  {
    id: 'thc-parcels', name: 'Historic resource parcels', provider: 'Texas Historical Commission', category: 'Parcels',
    description: 'Parcel ownership polygons associated with public historic-resource records.', color: '#ca8a04', tags: ['parcel', 'ownership', 'historic'],
    serviceUrl: 'https://gis.thc.texas.gov/arcgis/rest/services/Hosted/Parcel_Ownership/FeatureServer', layerId: 0,
  },
  {
    id: 'census-tracts', name: '2020 Census tracts', provider: 'U.S. Census Bureau', category: 'Demographics',
    description: 'Nationwide TIGERweb census tract boundaries.', color: '#2563eb', tags: ['census', 'tract', 'demographic', 'tiger'],
    serviceUrl: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer', layerId: 0,
  },
  {
    id: 'usgs-streams', name: 'NHDPlus flowlines', provider: 'USGS / EPA', category: 'Water',
    description: 'National Hydrography Dataset stream and river network.', color: '#0284c7', tags: ['water', 'river', 'stream', 'hydrology'],
    serviceUrl: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/NHDPlusV21/FeatureServer', layerId: 2,
  },
]

export const BASEMAPS = [
  { id: 'streets', name: 'Clean streets', tile: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png', attribution: '© OpenStreetMap © CARTO' },
  { id: 'satellite', name: 'Satellite', tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri' },
  { id: 'topo', name: 'USGS topo', tile: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', attribution: 'USGS The National Map' },
  { id: 'dark', name: 'Dark', tile: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', attribution: '© OpenStreetMap © CARTO' },
  { id: 'outdoors', name: 'OpenStreetMap', tile: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
]
