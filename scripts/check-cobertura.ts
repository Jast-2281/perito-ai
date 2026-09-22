// Puerta de cobertura.
//
// Un corpus puede crecer mucho y seguir sin tocar una regla entera. Este
// script recorre el catálogo completo de códigos de motivo y de estados
// posibles, corre todas las trampas, y falla si alguno no aparece jamás.
//
// Es distinto de los mutantes: los mutantes prueban que las trampas DETECTAN
// una regla rota; esto prueba que las trampas siquiera EJECUTAN esa regla.
// Una regla que nunca se ejecuta no puede tener un mutante que muera.
//
//   node --experimental-strip-types scripts/check-cobertura.ts

import { auditar } from '../src/dominio/motor.ts';
import { entornoPorDefecto } from '../src/dominio/entorno.ts';
import { construirFactura } from '../src/datos/constructor.ts';
import { TRAMPAS } from '../src/datos/trampas.ts';
import type { EstadoDictamen, FacturaCruda, MotivoCodigo } from '../src/dominio/tipos.ts';

// El catálogo completo. Si se agrega un motivo nuevo a tipos.ts y no se
// agrega aquí, este script no lo detecta — por eso la lista se mantiene a
// mano, y el README dice que hay que actualizarla.
const TODOS_MOTIVOS: MotivoCodigo[] = [
  'FUERA_DE_TARIFARIO',
  'SOBREPRECIO',
  'HORAS_EXCEDIDAS',
  'ZONA_INCOHERENTE',
  'CALIDAD_NO_PACTADA',
  'DUPLICADO_EN_FACTURA',
  'DUPLICADO_ENTRE_FACTURAS',
  'POSIBLE_DUPLICADO',
  'ARITMETICA_LINEA',
  'TOPE_MATERIALES',
  'SINIESTRO_INEXISTENTE',
  'PLACA_NO_COINCIDE',
  'FUERA_DE_VIGENCIA',
  'FACTURA_ANTERIOR_AL_SINIESTRO',
  'SINIESTRO_CERRADO',
  'TALLER_NO_AUTORIZADO',
  'ARITMETICA_TOTAL',
  'ITBMS_INCORRECTO',
  'TOTAL_INCOHERENTE',
  'EXCEDE_SUMA_ASEGURADA',
  'DATOS_INVALIDOS',
];

const TODOS_ESTADOS: EstadoDictamen[] = [
  'CONFORME',
  'OBJETADA_PARCIAL',
  'RECHAZADA',
  'DERIVADA',
  'PENDIENTE',
  'INVALIDA',
];

const env = entornoPorDefecto();
const motivosVistos = new Map<string, string[]>();
const estadosVistos = new Map<string, string[]>();

for (const t of TRAMPAS) {
  let d;
  try {
    const f = t.crudo ? (t.factura as unknown as FacturaCruda) : construirFactura(t.factura);
    d = auditar(f, env);
  } catch {
    continue; // el guantelete ya reporta esto como fallo de ese caso
  }
  const anota = (mapa: Map<string, string[]>, clave: string) => {
    const lista = mapa.get(clave) ?? [];
    if (!lista.includes(t.id)) lista.push(t.id);
    mapa.set(clave, lista);
  };
  anota(estadosVistos, d.estado);
  for (const m of d.motivosFactura) anota(motivosVistos, m.codigo);
  for (const l of d.lineas) for (const m of l.motivos) anota(motivosVistos, m.codigo);
}

const motivosHuérfanos = TODOS_MOTIVOS.filter((m) => !motivosVistos.has(m));
const estadosHuérfanos = TODOS_ESTADOS.filter((e) => !estadosVistos.has(e));

// Un motivo cubierto por UNA sola trampa es frágil: si esa trampa cambia de
// expectativa por otra razón, la regla queda sin vigilancia sin que nadie se
// entere. Se reporta como advertencia, no como fallo.
const motivosFrágiles = TODOS_MOTIVOS.filter((m) => (motivosVistos.get(m)?.length ?? 0) === 1);

console.log('');
console.log('  COBERTURA — ¿hay alguna regla que ninguna trampa ejecuta?');
console.log('  ' + '-'.repeat(62));
console.log(`  Motivos ejercitados  ${TODOS_MOTIVOS.length - motivosHuérfanos.length} de ${TODOS_MOTIVOS.length}`);
console.log(`  Estados ejercitados  ${TODOS_ESTADOS.length - estadosHuérfanos.length} de ${TODOS_ESTADOS.length}`);

if (motivosHuérfanos.length) {
  console.log('');
  console.log('  Motivos que ninguna trampa produce:');
  for (const m of motivosHuérfanos) console.log(`    ${m}`);
}
if (estadosHuérfanos.length) {
  console.log('');
  console.log('  Estados que ninguna trampa produce:');
  for (const e of estadosHuérfanos) console.log(`    ${e}`);
}
if (motivosFrágiles.length) {
  console.log('');
  console.log('  Advertencia — motivos sostenidos por una sola trampa:');
  for (const m of motivosFrágiles) console.log(`    ${m.padEnd(32)} ${motivosVistos.get(m)?.join(', ')}`);
}
console.log('');

process.exit(motivosHuérfanos.length || estadosHuérfanos.length ? 1 : 0);
