// Puerta antes de entregar. Corre el guantelete completo y falla si aparece
// una sola aprobación indebida o una sola objeción falsa.
//
//   node --experimental-strip-types scripts/check-trampas.ts

import { auditar } from '../src/dominio/motor.ts';
import { entornoPorDefecto } from '../src/dominio/entorno.ts';
import { construirFactura } from '../src/datos/constructor.ts';
import { TRAMPAS } from '../src/datos/trampas.ts';
import { formato } from '../src/dominio/dinero.ts';
import type { FacturaCruda } from '../src/dominio/tipos.ts';

const env = entornoPorDefecto();
const estricto = process.argv.includes('--estricto');

let ok = 0;
let aprobacionesIndebidas = 0;
let objecionesFalsas = 0;
const fallos: string[] = [];
const tiempos: number[] = [];

for (const t of TRAMPAS) {
  let f: FacturaCruda;
  let d;
  try {
    // Entrada cruda: se le pasa al motor exactamente lo que trae `factura`,
    // sin pasar por el constructor. Así se prueba la validación de entrada
    // contra objetos que el constructor no sabría fabricar (null, campos con
    // el tipo equivocado).
    f = t.crudo ? (t.factura as unknown as FacturaCruda) : construirFactura(t.factura);
    d = auditar(f, env);
  } catch (e) {
    // El motor no debe reventar NUNCA. Si lo hace, es el fallo de este caso
    // — no motivo para perder el resultado de los demás 51.
    fallos.push(`  ${t.id.padEnd(22)} el motor reventó: ${(e as Error).message}`);
    continue;
  }
  tiempos.push(d.ms);

  const codigos = new Set([
    ...d.motivosFactura.map((m) => m.codigo),
    ...d.lineas.flatMap((l) => l.motivos.map((m) => m.codigo)),
  ]);
  const objetadoLineas = d.lineas.reduce((a, l) => a + l.montoObjetado, 0);
  const problemas: string[] = [];

  if (d.estado !== t.espera.estado) {
    problemas.push(`estado ${d.estado}, se esperaba ${t.espera.estado}`);
    const debiaObjetar = t.espera.estado !== 'CONFORME';
    const objeto = d.estado !== 'CONFORME';
    if (debiaObjetar && !objeto) aprobacionesIndebidas++;
    if (!debiaObjetar && objeto) objecionesFalsas++;
  }

  for (const m of t.espera.motivos) {
    if (!codigos.has(m)) problemas.push(`falta el motivo ${m}`);
  }
  for (const m of t.espera.prohibidos ?? []) {
    if (codigos.has(m)) {
      problemas.push(`motivo indebido ${m}`);
      objecionesFalsas++;
    }
  }
  // Invariantes de conciliación global, independientes de lo que espere el caso.
  if (d.totalAPagar > d.totalFacturado) {
    problemas.push(
      `a pagar ${formato(d.totalAPagar)} sobre un cobro de ${formato(d.totalFacturado)}`,
    );
  }
  if (d.totalAPagar + d.totalObjetado + d.montoPorConciliar !== d.totalFacturado) {
    problemas.push('a pagar + objetado + por conciliar no cuadra con lo cobrado');
  }
  // Un porcentaje sobre un total que no concilia consigo mismo no describe
  // nada: debe venir como "no calculable", nunca como un número. Solo aplica
  // a facturas que llegaron a auditarse — una INVALIDA se rechaza en la
  // puerta y nunca evalúa conciliación.
  if (d.estado !== 'INVALIDA') {
    if (!d.documentoConcilia && d.porcentajeObjetado !== null) {
      problemas.push(`porcentaje ${d.porcentajeObjetado}% sobre un documento que no concilia`);
    }
    if (d.documentoConcilia && d.porcentajeObjetado === null) {
      problemas.push('porcentaje nulo en un documento que sí concilia');
    }
  }
  // Un documento que sí concilia no puede tener nada "por conciliar".
  if (d.documentoConcilia && d.montoPorConciliar !== 0) {
    problemas.push('monto por conciliar en un documento que sí concilia');
  }
  if (!d.documentoConcilia && d.estado !== 'INVALIDA') {
    const sinHallazgosDeLinea = d.lineas.every((l) => l.montoObjetado === 0);
    if (sinHallazgosDeLinea && d.totalObjetado !== 0) {
      problemas.push('objetado sin un solo hallazgo de línea, en un documento que solo necesita conciliar');
    }
  }
  if (d.estado !== 'INVALIDA') {
    const sumaRec = d.lineas.reduce((a, l) => a + l.montoReconocido, 0);
    const sumaObj = d.lineas.reduce((a, l) => a + l.montoObjetado, 0);
    if (sumaRec + sumaObj !== d.sumaLineas) {
      problemas.push('las líneas no suman el total de líneas del documento');
    }
  }
  // La bandera de revisión y el estado dicen lo mismo, siempre.
  const estadosDeRevision = ['PENDIENTE', 'DERIVADA', 'INVALIDA'];
  if (d.requiereRevision !== estadosDeRevision.includes(d.estado)) {
    problemas.push(`estado ${d.estado} con requiereRevision=${d.requiereRevision}`);
  }
  if (d.requiereRevision && d.razonesRevision.length === 0) {
    problemas.push('requiere revisión sin decir por qué');
  }
  // Un ajuste de dinero no puede borrar una línea que pedía revisión.
  for (const l of d.lineas) {
    if (l.requiereRevision && l.estado === 'OBJETADA') {
      problemas.push(`línea ${l.indice}: pedía revisión y quedó solo como objetada`);
    }
  }
  // El total declarado se conserva tal cual. La excepción es un documento que
  // ni siquiera es auditable: ahí no se reporta una cifra que no es de fiar.
  const datosInvalidos = d.puertaQueCerro === 'DATOS_INVALIDOS';
  if (!datosInvalidos && d.totalFacturado !== f.totalDeclarado) {
    problemas.push('el total declarado fue sustituido');
  }
  if (datosInvalidos && d.totalFacturado !== 0) {
    problemas.push('un documento no auditable no puede reportar un monto');
  }
  if (!d.documentoConcilia && d.totalAPagar !== 0) {
    problemas.push('importe reconocido sobre un documento que no concilia');
  }

  // Una cita reconstruida no puede sostener una conformidad automática.
  const reconstruida = d.lineas.some((l) => l.motivos.some((m) => m.origenCita === 'reconstruida'));
  if (reconstruida && d.estado === 'CONFORME') {
    problemas.push('CONFORME apoyado en una cita reconstruida');
  }

  if (
    t.espera.objetadoLineas !== undefined &&
    objetadoLineas !== t.espera.objetadoLineas
  ) {
    problemas.push(
      `objetado en líneas ${formato(objetadoLineas)}, se esperaba ${formato(t.espera.objetadoLineas)}`,
    );
  }

  // Toda objeción con monto debe traer cláusula y cita. Sin cita, no existe.
  for (const l of d.lineas) {
    for (const m of l.motivos) {
      if (!m.clausula) problemas.push(`motivo ${m.codigo} sin cláusula`);
      if (!m.cita) problemas.push(`motivo ${m.codigo} sin cita`);
    }
    // Invariante: nunca se objeta más dinero del que la línea cobró.
    const sumaMotivos = l.motivos.reduce((a, m) => a + m.monto, 0);
    if (sumaMotivos > l.cruda.importe) {
      problemas.push(
        `línea ${l.indice}: motivos por ${formato(sumaMotivos)} sobre un cobro de ${formato(l.cruda.importe)}`,
      );
    }
    if (l.montoReconocido + l.montoObjetado !== l.cruda.importe) {
      problemas.push(`línea ${l.indice}: reconocido + objetado no cuadra con lo facturado`);
    }
  }

  if (problemas.length === 0) {
    ok++;
  } else {
    fallos.push(`  ${t.id.padEnd(22)} ${problemas.join(' · ')}`);
  }
}

const p95 = [...tiempos].sort((a, b) => a - b)[Math.floor(tiempos.length * 0.95)];
const media = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;

console.log('');
console.log('  GUANTELETE — auditoría de facturación de siniestros');
console.log('  ' + '-'.repeat(58));
console.log(`  Casos            ${ok} de ${TRAMPAS.length}`);
console.log(`  Aprob. indebidas ${aprobacionesIndebidas}`);
console.log(`  Objec. falsas    ${objecionesFalsas}`);
console.log(`  Motor            media ${media.toFixed(3)} ms · p95 ${p95?.toFixed(3)} ms`);
console.log('  (motor determinista, no latencia del sistema completo)');
if (fallos.length) {
  console.log('');
  console.log('  Fallos:');
  for (const f of fallos) console.log(f);
}
console.log('');

// Código 2 = una aserción falló. Cualquier otro código distinto de 0 significa
// que el proceso se cayó, que NO es lo mismo: check-mutantes los distingue.
const debeFallar = estricto
  ? fallos.length > 0
  : aprobacionesIndebidas > 0 || objecionesFalsas > 0;
if (debeFallar) console.log('  GUANTELETE:FALLO');
process.exit(debeFallar ? 2 : 0);
