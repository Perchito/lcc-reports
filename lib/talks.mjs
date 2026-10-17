// Toolbox talks / refresher training. Workers read a talk in Spanish and sign it; the sign-off sheet PDF is English.
// Built-in talks (ids TB-01…) are loaded once as drafts — nothing reaches workers until an admin publishes one.
// A published talk has rounds: publishing (or the automatic refresher every refreshMonths) starts a new round,
// and everyone signs again. Signatures live in talk_signs (talk_id, email, round).

export const DEFAULT_REFRESH = 12; // months; 0 = never repeats
export const DUE_DAYS = 14; // default time to sign

const t = (id, es, en) => ({ id, title: es.title, body: es.body, titleEn: en.title, bodyEn: en.body, refreshMonths: DEFAULT_REFRESH, builtin: true });
export const LIBRARY = [
  t('TB-01', {
    title: 'Trabajo en altura: escaleras y plataformas',
    body: `- Usa la escalera solo para trabajos cortos y sencillos. Para más tiempo, usa una plataforma o andamio.
- Revisa la escalera antes de usarla: patas, peldaños, gomas y cierres sin daños.
- Apóyala en suelo firme y nivelado. Escalera de mano: 1 de separación por cada 4 de altura.
- Mantén siempre tres puntos de apoyo (dos pies y una mano) y no te estires hacia los lados.
- No te subas a los tres últimos peldaños ni uses sillas, cubos o bañeras como escalón.
- No trabajes en altura si estás solo y nadie sabe dónde estás.`,
  }, {
    title: 'Working at height: ladders and platforms',
    body: `- Use a ladder only for short, simple tasks. For longer work use a platform or tower.
- Check the ladder before use: feet, rungs, rubbers and locks undamaged.
- Stand it on firm, level ground. Leaning ladder: 1 out for every 4 up.
- Always keep three points of contact (two feet and one hand) and do not over-reach.
- Do not stand on the top three rungs or use chairs, buckets or baths as a step.
- Do not work at height alone without anyone knowing where you are.`,
  }),
  t('TB-02', {
    title: 'Polvo y sílice',
    body: `- Cortar azulejos, piedra, hormigón o lijar yeso produce polvo de sílice, que daña los pulmones para siempre.
- Corta en húmedo o con aspiración siempre que puedas, y mejor fuera de la vivienda.
- Usa mascarilla FFP3 bien ajustada (sin barba en la zona del ajuste) cuando haya polvo.
- No barras en seco ni uses aire a presión: aspira con un aspirador de clase M o H.
- Cierra la zona de trabajo y protege muebles y otras habitaciones del residente.
- Lávate antes de comer, beber o fumar.`,
  }, {
    title: 'Dust and silica',
    body: `- Cutting tiles, stone, concrete or sanding plaster produces silica dust, which permanently damages the lungs.
- Cut wet or with extraction whenever possible, preferably outside the property.
- Wear a well-fitted FFP3 mask (clean-shaven where it seals) whenever there is dust.
- Do not dry sweep or use compressed air: vacuum with an M or H class vacuum.
- Close off the work area and protect the resident's furniture and other rooms.
- Wash before eating, drinking or smoking.`,
  }),
  t('TB-03', {
    title: 'Manipulación manual de cargas',
    body: `- Antes de levantar algo (bañeras, platos de ducha, encimeras, sacos), piensa: ¿pesa mucho?, ¿hay ayuda o un carro?
- Prepara el camino: puertas abiertas, sin obstáculos ni suelos mojados.
- Pies separados, dobla las rodillas, espalda recta y la carga pegada al cuerpo.
- No gires la espalda con la carga: mueve los pies.
- Las cargas pesadas o grandes, entre dos personas.
- Si te haces daño, para y avisa al administrador.`,
  }, {
    title: 'Manual handling',
    body: `- Before lifting (baths, shower trays, worktops, bags), think: is it heavy? Is help or a trolley available?
- Clear the route: doors open, no obstacles or wet floors.
- Feet apart, bend the knees, straight back and keep the load close to the body.
- Do not twist with the load: move your feet.
- Heavy or bulky loads are a two-person lift.
- If you hurt yourself, stop and tell the admin.`,
  }),
  t('TB-04', {
    title: 'Amianto: qué hacer si lo encuentras',
    body: `- Las casas construidas antes del año 2000 pueden tener amianto: placas de techo, suelos de vinilo, cisternas antiguas, paneles, texturas de techo (Artex).
- Si sospechas que algo puede tener amianto, NO lo cortes, taladres, rompas ni lijes.
- Para el trabajo en esa zona, sal de la habitación y cierra la puerta.
- Avisa al administrador enseguida y comunícalo como problema en la app con una foto.
- No vuelvas a esa zona hasta que te digan que es seguro.`,
  }, {
    title: 'Asbestos: what to do if you find it',
    body: `- Properties built before 2000 may contain asbestos: ceiling boards, vinyl floor tiles, old cisterns, panels, textured coatings (Artex).
- If you suspect something may contain asbestos, do NOT cut, drill, break or sand it.
- Stop work in that area, leave the room and close the door.
- Tell the admin straight away and report it as a problem in the app with a photo.
- Do not return to that area until you are told it is safe.`,
  }),
  t('TB-05', {
    title: 'Seguridad eléctrica',
    body: `- Antes de taladrar paredes o suelos, busca cables y tuberías con un detector.
- En baños y cocinas, el agua y la electricidad son un peligro: corta la corriente del circuito antes de trabajar cerca.
- Solo un electricista cualificado hace trabajos eléctricos.
- Revisa cables, enchufes y alargadores de tus herramientas: si están dañados, no los uses.
- No dejes cables pelados, cajas abiertas ni enchufes sin tapa al terminar el día.`,
  }, {
    title: 'Electrical safety',
    body: `- Before drilling walls or floors, check for cables and pipes with a detector.
- In bathrooms and kitchens water and electricity are a hazard: isolate the circuit before working nearby.
- Only a qualified electrician carries out electrical work.
- Check the leads, plugs and extension cables of your tools: if damaged, do not use them.
- Do not leave bare wires, open boxes or uncovered sockets at the end of the day.`,
  }),
  t('TB-06', {
    title: 'Resbalones, tropiezos y orden en la obra',
    body: `- Mantén el paso libre: herramientas, cables y material recogidos.
- Seca el agua del suelo enseguida y avisa si el suelo está resbaladizo.
- Tapa o señaliza agujeros en el suelo y tablas sueltas.
- Saca la basura y los escombros cada día, no los acumules.
- Ilumina bien la zona de trabajo y las escaleras.`,
  }, {
    title: 'Slips, trips and good housekeeping',
    body: `- Keep walkways clear: tools, cables and materials tidied away.
- Dry wet floors straight away and warn others if a floor is slippery.
- Cover or mark holes in the floor and loose boards.
- Remove rubbish and debris every day; do not let it build up.
- Keep the work area and stairs well lit.`,
  }),
  t('TB-07', {
    title: 'Equipo de protección individual (EPI)',
    body: `- El EPI es la última protección: úsalo siempre que haga falta.
- Botas de seguridad todo el día en la obra.
- Gafas al cortar, taladrar, picar o usar productos químicos.
- Guantes adecuados para cada trabajo (corte, químicos, agua).
- Mascarilla FFP3 con polvo y protección auditiva con herramientas ruidosas.
- Si tu EPI está dañado o te falta algo, dilo en el control de seguridad y al administrador.`,
  }, {
    title: 'Personal protective equipment (PPE)',
    body: `- PPE is the last line of protection: always wear it when needed.
- Safety boots all day on site.
- Eye protection when cutting, drilling, chiselling or using chemicals.
- The right gloves for each task (cut, chemical, wet work).
- FFP3 mask for dust and hearing protection with noisy tools.
- If your PPE is damaged or missing, record it in the safety check and tell the admin.`,
  }),
  t('TB-08', {
    title: 'Productos químicos (COSHH)',
    body: `- Siliconas, adhesivos, disolventes, limpiadores y lechadas pueden irritar la piel, los ojos y los pulmones.
- Lee la etiqueta y sigue las instrucciones antes de usar un producto.
- Ventila bien la habitación (ventana abierta, extractor).
- Usa guantes y gafas, y no mezcles productos.
- Guarda los productos cerrados y fuera del alcance de niños y mascotas del residente.`,
  }, {
    title: 'Hazardous substances (COSHH)',
    body: `- Silicones, adhesives, solvents, cleaners and grouts can irritate the skin, eyes and lungs.
- Read the label and follow the instructions before using a product.
- Ventilate the room well (window open, extractor on).
- Wear gloves and eye protection, and never mix products.
- Store products closed and out of reach of the resident's children and pets.`,
  }),
  t('TB-09', {
    title: 'Incendios y trabajos en caliente',
    body: `- Soldar tuberías o usar sopletes puede prender madera, aislantes y polvo.
- Retira o protege lo que pueda arder y ten un extintor o manta a mano.
- Vigila la zona al menos 60 minutos después de terminar el trabajo en caliente.
- No tapes detectores de humo; si los cubres por el polvo, destápalos al terminar el día.
- Conoce la salida de la vivienda y no bloquees puertas ni pasillos.`,
  }, {
    title: 'Fire and hot works',
    body: `- Soldering pipes or using blowtorches can ignite timber, insulation and dust.
- Remove or protect anything combustible and keep an extinguisher or fire blanket to hand.
- Watch the area for at least 60 minutes after finishing hot works.
- Do not cover smoke alarms; if covered against dust, uncover them at the end of the day.
- Know the way out of the property and never block doors or corridors.`,
  }),
  t('TB-10', {
    title: 'Accidentes, primeros auxilios y trabajar en casas habitadas',
    body: `- Lleva el botiquín a cada obra y comprueba que está completo.
- En caso de accidente: atiende a la persona, llama al 999 si es grave y avisa al administrador enseguida.
- Todo accidente o casi accidente se comunica, aunque parezca pequeño.
- En casas con residentes: respeta su espacio, mantén a niños y mascotas lejos de la zona de trabajo y nunca dejes herramientas al alcance.
- Al terminar el día, deja la vivienda segura: agua, gas y electricidad en condiciones seguras.`,
  }, {
    title: 'Accidents, first aid and working in occupied homes',
    body: `- Take the first-aid kit to every job and check it is complete.
- If there is an accident: help the person, call 999 if serious and tell the admin straight away.
- Report every accident or near miss, however small.
- In occupied homes: respect the residents' space, keep children and pets away from the work area and never leave tools within reach.
- At the end of the day leave the property safe: water, gas and electricity in a safe condition.`,
  }),
];

const bad = (status, message) => Object.assign(new Error(message), { status });
const text = (v, max) => String(v ?? '').trim().slice(0, max);
/** Fields an admin may set on a talk. */
export function cleanTalk(b, partial = false) {
  const out = {};
  if (!partial || 'title' in b) { out.title = text(b.title, 140); if (!out.title) throw bad(400, 'Falta el título'); }
  if (!partial || 'body' in b) { out.body = text(b.body, 8000); if (!out.body) throw bad(400, 'Falta el texto de la charla'); }
  if (!partial || 'refreshMonths' in b) {
    const m = Number(b.refreshMonths ?? DEFAULT_REFRESH);
    if (!Number.isInteger(m) || m < 0 || m > 60) throw bad(400, 'Repetición no válida');
    out.refreshMonths = m;
  }
  return out;
}
/** When a published talk is due for its refresher round (null = never). */
export function refreshAt(talk) {
  if (!talk.round || !talk.refreshMonths || !talk.publishedAt) return null;
  const d = new Date(talk.publishedAt);
  d.setMonth(d.getMonth() + talk.refreshMonths);
  return d;
}
export const dueIn = (days = DUE_DAYS) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert')).strict;
  assert.equal(LIBRARY.length, 10);
  assert.ok(LIBRARY.every((x) => x.title && x.body && x.titleEn && x.bodyEn));
  assert.throws(() => cleanTalk({ title: '', body: 'x' }));
  assert.equal(cleanTalk({ title: 'a', body: 'b' }).refreshMonths, 12);
  assert.deepEqual(cleanTalk({ refreshMonths: 0 }, true), { refreshMonths: 0 });
  assert.equal(refreshAt({ round: 1, refreshMonths: 12, publishedAt: '2026-01-15T10:00:00Z' }).toISOString().slice(0, 7), '2027-01');
  assert.equal(refreshAt({ round: 0, refreshMonths: 12, publishedAt: null }), null);
  console.log('talks ok');
}
