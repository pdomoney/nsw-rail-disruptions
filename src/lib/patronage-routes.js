// Reference station sequence for patronage display only. This is NOT a
// train-service timetable, boarding direction or ridership allocation.
// TfNSW SCO and T4 share the Illawarra approaches to Sydney; their trains can
// serve different stops and operating patterns change (including late 2026).
//
// A continuous route is selected before interpreting a "stop order", since
// Cronulla, Port Kembla and Bomaderry are distinct branches.
const SOUTH_SPINE = [
  'Central','Redfern','Sydenham','Tempe','Wolli Creek','Arncliffe','Banksia',
  'Rockdale','Kogarah','Carlton','Allawah','Hurstville','Penshurst','Mortdale',
  'Oatley','Como','Jannali','Sutherland','Loftus','Engadine','Heathcote','Waterfall',
];
const COAST = [
  'Helensburgh','Otford','Stanwell Park','Coalcliff','Scarborough','Wombarra',
  'Coledale','Austinmer','Thirroul','Bulli','Woonona','Bellambi','Corrimal',
  'Towradgi','Fairy Meadow','North Wollongong','Wollongong','Coniston','Unanderra',
  'Kembla Grange','Dapto','Albion Park','Oak Flats','Shellharbour Junction',
  'Minnamurra','Bombo','Kiama','Gerringong','Berry','Bomaderry (Nowra)',
];
const PORT_KEMBLA = ['Cringila','Lysaghts','Port Kembla North','Port Kembla'];
const CRONULLA = ['Kirrawee','Gymea','Miranda','Caringbah','Woolooware','Cronulla'];

export const PATRONAGE_CORRIDORS = Object.freeze([
  {id:'T4_SCO', name:'T4 + SCO · Connected Illawarra / South Coast', lines:['T4','SCO'],
   note:'Shared and connecting station corridor only; not a single stopping service or passenger-origin model.',
   routes:[
     {id:'south-coast',name:'Central to Bomaderry via Waterfall',stations:[...SOUTH_SPINE,...COAST]},
     {id:'port-kembla',name:'Central to Port Kembla via Coniston',
      stations:[...SOUTH_SPINE,...COAST.slice(0,COAST.indexOf('Coniston')+1),...PORT_KEMBLA]},
     {id:'cronulla',name:'Central to Cronulla via Sutherland',
      stations:[...SOUTH_SPINE.slice(0,SOUTH_SPINE.indexOf('Sutherland')+1),...CRONULLA]},
   ],
  }
]);

// Reference routes built from named corridor stops in the existing railway
// network model; avoid relying on geographic X/Y sorting and reversing at
// interchange joins. These ordered lines are not current stopping patterns.
export function buildPatronageRoutes(lineSequences){
  const lines={};
  for(const [id,sequences] of Object.entries(lineSequences||{})){
    lines[id]=(sequences||[]).filter(r=>Array.isArray(r)&&r.length>0)
      .map((route,i)=>({id:id+'-'+(i+1),name:route[0]+' → '+route.at(-1),
        stations:[...route]}));
  }
  return {schema:1,meaning:'Reference physical station order, not timetabled service stops or directional boardings',
    source:'TfNSW published route stop geography and existing named railway corridor model',
    lines,corridors:PATRONAGE_CORRIDORS};
}
