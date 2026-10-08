export const SERVICE = {
  MEDICAL: 'medical',
  FIRE: 'fire',
} as const;

export type ServiceType = (typeof SERVICE)[keyof typeof SERVICE];

export interface EmergencyClass {
  id: string;
  label: string;
  priority: 1 | 2 | 3;
  icon: string;
  description: string;
}

export const EMERGENCY_CLASSES: Record<ServiceType, EmergencyClass[]> = {
  medical: [
    { id: 'cardiac', label: 'Cardiac Arrest', priority: 1, icon: 'heart.fill', description: 'Severe chest pain, unresponsive or sudden collapse' },
    { id: 'trauma', label: 'Major Trauma', priority: 1, icon: 'cross.case.fill', description: 'Severe bleeding, head injury or fall from height' },
    { id: 'rta', label: 'Road Accident', priority: 1, icon: 'car.fill', description: 'Vehicle collision, pedestrian struck, trapped victims' },
    { id: 'stroke', label: 'Suspected Stroke', priority: 2, icon: 'brain.head.profile', description: 'Facial drooping, arm weakness, slurred speech' },
    { id: 'obstetric', label: 'Obstetric Emergency', priority: 2, icon: 'person.2.fill', description: 'Labour complications or severe pregnancy distress' },
    { id: 'transfer', label: 'Medical Transfer', priority: 3, icon: 'bed.double.fill', description: 'Non-critical urgent hospital transfer' },
    { id: 'custom', label: 'Other Medical', priority: 2, icon: 'ellipsis.circle.fill', description: 'Other urgent medical condition' },
  ],
  fire: [
    { id: 'structure_fire', label: 'Structure Fire', priority: 1, icon: 'flame.fill', description: 'Building, residential home or factory blaze' },
    { id: 'vehicle_fire', label: 'Vehicle Fire', priority: 2, icon: 'car.side.fill', description: 'Car, bus or commercial vehicle on fire' },
    { id: 'hazmat', label: 'Hazmat Spill', priority: 1, icon: 'exclamationmark.triangle.fill', description: 'Chemical leak, toxic fumes or industrial hazard' },
    { id: 'rescue', label: 'Technical Rescue', priority: 2, icon: 'person.crop.circle.badge.exclamationmark', description: 'Trapped in elevator, collapsed trench, water rescue' },
    { id: 'alarm', label: 'Automatic Alarm', priority: 3, icon: 'bell.badge.fill', description: 'Smoke detector or fire alarm triggered' },
    { id: 'custom', label: 'Other Fire / Rescue', priority: 2, icon: 'ellipsis.circle.fill', description: 'Other urgent fire or rescue situation' },
  ],
};

export const PRIORITY_CONFIG = {
  1: { label: 'P1 · CRITICAL', color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5', desc: 'Life-threatening · Immediate dispatch' },
  2: { label: 'P2 · HIGH', color: '#EA580C', bg: '#FFF7ED', border: '#FDBA74', desc: 'Urgent · Priority dispatch' },
  3: { label: 'P3 · NORMAL', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Standard response' },
} as const;

export interface JunctionNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const POPULAR_JUNCTIONS: JunctionNode[] = [
  {
    "id": "J0001",
    "name": "Delhi Gate Flyover junction",
    "lat": 28.661449,
    "lng": 77.425685
  },
  {
    "id": "J0002",
    "name": "Wazirabad Road / Ghaziabad Bypass",
    "lat": 28.673504,
    "lng": 77.405276
  },
  {
    "id": "J0003",
    "name": "Wazirabad Road / Ghaziabad Bypass (2)",
    "lat": 28.673396,
    "lng": 77.405646
  },
  {
    "id": "J0004",
    "name": "Wazirabad Road junction",
    "lat": 28.672918,
    "lng": 77.407334
  },
  {
    "id": "J0005",
    "name": "Wazirabad Road junction (2)",
    "lat": 28.671767,
    "lng": 77.412007
  },
  {
    "id": "J0006",
    "name": "hapur road / Hapur Road",
    "lat": 28.669937,
    "lng": 77.428673
  },
  {
    "id": "J0007",
    "name": "Hapur Road junction",
    "lat": 28.669295,
    "lng": 77.425573
  },
  {
    "id": "J0008",
    "name": "Hapur Road junction (2)",
    "lat": 28.665992,
    "lng": 77.422535
  },
  {
    "id": "J0009",
    "name": "Grand Trunk Road junction",
    "lat": 28.62504,
    "lng": 77.476784
  },
  {
    "id": "J0010",
    "name": "Grand Trunk Road junction (2)",
    "lat": 28.630012,
    "lng": 77.4698
  },
  {
    "id": "J0011",
    "name": "Grand Trunk Road junction (3)",
    "lat": 28.636154,
    "lng": 77.461217
  },
  {
    "id": "J0012",
    "name": "Grand Trunk Road junction (4)",
    "lat": 28.636376,
    "lng": 77.460885
  },
  {
    "id": "J0013",
    "name": "Delhi - Meerut Expressway / Delhi-Meerut Expressway",
    "lat": 28.634099,
    "lng": 77.456369
  },
  {
    "id": "J0014",
    "name": "Grand Trunk Road / Ghaziabad Railway Flyover",
    "lat": 28.653808,
    "lng": 77.436592
  },
  {
    "id": "J0015",
    "name": "Thana Road junction",
    "lat": 28.645602,
    "lng": 77.421714
  },
  {
    "id": "J0016",
    "name": "Thana Road junction (2)",
    "lat": 28.646089,
    "lng": 77.421591
  },
  {
    "id": "J0017",
    "name": "Thana Road junction (3)",
    "lat": 28.646348,
    "lng": 77.421526
  },
  {
    "id": "J0018",
    "name": "Thana Road / Gaushala Road",
    "lat": 28.651411,
    "lng": 77.420309
  },
  {
    "id": "J0019",
    "name": "Thana Road / Gaushala Road (2)",
    "lat": 28.651448,
    "lng": 77.420298
  },
  {
    "id": "J0020",
    "name": "Thana Road junction (4)",
    "lat": 28.656719,
    "lng": 77.41905
  },
  {
    "id": "J0021",
    "name": "National Highway 24 Bypass junction",
    "lat": 28.634798,
    "lng": 77.457983
  },
  {
    "id": "J0022",
    "name": "Grand Trunk Road junction (5)",
    "lat": 28.637195,
    "lng": 77.459791
  },
  {
    "id": "J0023",
    "name": "Maharana Pratap Marg / Rani Jhansi Road",
    "lat": 28.690589,
    "lng": 77.44798
  },
  {
    "id": "J0024",
    "name": "Maharana Pratap Marg junction",
    "lat": 28.692452,
    "lng": 77.445894
  },
  {
    "id": "J0025",
    "name": "Maharana Pratap Marg junction (2)",
    "lat": 28.690065,
    "lng": 77.443648
  },
  {
    "id": "J0026",
    "name": "Maharana Pratap Marg / Prithviraj Marg",
    "lat": 28.687975,
    "lng": 77.44174
  },
  {
    "id": "J0027",
    "name": "Maharana Pratap Marg junction (3)",
    "lat": 28.683704,
    "lng": 77.43901
  },
  {
    "id": "J0028",
    "name": "Maharana Pratap Marg junction (4)",
    "lat": 28.677602,
    "lng": 77.437977
  },
  {
    "id": "J0029",
    "name": "Tagore Road / Hapur Road",
    "lat": 28.67316,
    "lng": 77.449595
  },
  {
    "id": "J0030",
    "name": "Tagore Road junction",
    "lat": 28.667263,
    "lng": 77.449957
  },
  {
    "id": "J0031",
    "name": "Tagore Road junction (2)",
    "lat": 28.664243,
    "lng": 77.452561
  },
  {
    "id": "J0032",
    "name": "Surdas Marg / Maharana Pratap Marg",
    "lat": 28.656124,
    "lng": 77.451701
  },
  {
    "id": "J0033",
    "name": "Surdas Marg junction",
    "lat": 28.656964,
    "lng": 77.452606
  },
  {
    "id": "J0034",
    "name": "Surdas Marg junction (2)",
    "lat": 28.660598,
    "lng": 77.454584
  },
  {
    "id": "J0035",
    "name": "Surdas Marg junction (3)",
    "lat": 28.665106,
    "lng": 77.455926
  },
  {
    "id": "J0036",
    "name": "Grand Trunk Road junction (6)",
    "lat": 28.637278,
    "lng": 77.459837
  },
  {
    "id": "J0037",
    "name": "Near Grand Trunk Road",
    "lat": 28.644251,
    "lng": 77.464847
  },
  {
    "id": "J0038",
    "name": "Near Grand Trunk Road (2)",
    "lat": 28.644748,
    "lng": 77.465199
  },
  {
    "id": "J0039",
    "name": "Junction 39",
    "lat": 28.644845,
    "lng": 77.465269
  },
  {
    "id": "J0040",
    "name": "Junction 40",
    "lat": 28.650202,
    "lng": 77.469185
  },
  {
    "id": "J0041",
    "name": "Junction 41",
    "lat": 28.650619,
    "lng": 77.469488
  },
  {
    "id": "J0042",
    "name": "Junction 42",
    "lat": 28.652748,
    "lng": 77.471102
  },
  {
    "id": "J0043",
    "name": "Junction 43",
    "lat": 28.647357,
    "lng": 77.461322
  },
  {
    "id": "J0044",
    "name": "Near Grand Trunk Road (3)",
    "lat": 28.64955,
    "lng": 77.45823
  },
  {
    "id": "J0045",
    "name": "Near Tagore Road",
    "lat": 28.668396,
    "lng": 77.453091
  },
  {
    "id": "J0046",
    "name": "Near Tagore Road (2)",
    "lat": 28.669414,
    "lng": 77.456045
  },
  {
    "id": "J0047",
    "name": "Maharana Pratap Marg junction (5)",
    "lat": 28.65954,
    "lng": 77.449005
  },
  {
    "id": "J0048",
    "name": "Nirala Marg junction",
    "lat": 28.669464,
    "lng": 77.456201
  },
  {
    "id": "J0049",
    "name": "Nirala Marg junction (2)",
    "lat": 28.671108,
    "lng": 77.46366
  },
  {
    "id": "J0050",
    "name": "Thana Road junction (5)",
    "lat": 28.656829,
    "lng": 77.419117
  }
];
