// Puerta de integración: extracción + motor, juntos.
//
// Las otras puertas prueban cada mitad por separado, y por eso ninguna vio
// el fallo que motivó este archivo: la extracción marcaba una lectura como
// ambigua, el motor decía CONFORME, y el resultado combinado le mostraba al
// perito dos mensajes contradictorios — "confirme esta lectura" junto a
// "sin discrepancias". Cada mitad estaba bien; la costura estaba mal.
//
// Aquí se prueba el recorrido completo tal como lo ejecuta la ruta de la
// API: texto → extracción → motor → dictamen. Sin red y sin clave: las
// respuestas del modelo son simuladas.
//
//   node --experimental-strip-types scripts/check-integracion.ts

import { aFacturaCruda } from '../src/ia/extraccion.ts';
import { auditar } from '../src/dominio/motor.ts';
import { entornoPorDefecto } from '../src/dominio/entorno.ts';
import { formato } from '../src/dominio/dinero.ts';
import type { EstadoDictamen, MotivoCodigo } from '../src/dominio/tipos.ts';

const env = entornoPorDefecto();

interface Caso {
  id: string;
  nota: string;
  texto: string;
  respuesta: unknown;
  espera: {
    estado: EstadoDictamen;
    requiereRevision: boolean;
    /** Motivos que deben aparecer en el dictamen. */
    motivos?: MotivoCodigo[];
    /** Si se declara, cuántas líneas deben llegar al motor. */
    lineas?: number;
    /** Si se declara, el objetado exacto en centavos. */
    objetado?: number;
  };
}

// Cabecera válida y reutilizable: el siniestro, taller y placa existen en el
// corpus, así que las puertas de admisión pasan y lo que se prueba es la
// costura entre extracción y motor.
const CAB = {
  numero: 'FAC-9100', numero_cita: 'Factura FAC-9100',
  siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
  taller: 'TLR-001', taller_cita: 'taller TLR-001',
  placa: 'AB1234', placa_cita: 'placa AB1234',
  fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
};
const TEXTO_CAB =
  'Factura FAC-9100 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\n';

const CASOS: Caso[] = [
  {
    id: 'INT-CORRECTA-01',
    nota: 'Factura bien leída y sin discrepancias. El único caso que puede terminar CONFORME.',
    texto:
      TEXTO_CAB +
      'cantidad 1 x Parachoques delantero REP-F-01 precio B/.420.00 importe B/.420.00\n' +
      'Subtotal: B/.420.00 ITBMS: B/.29.40 Total: B/.449.40',
    respuesta: {
      ...CAB,
      subtotal: 420, subtotal_cita: 'Subtotal: B/.420.00',
      itbms: 29.4, itbms_cita: 'ITBMS: B/.29.40',
      total: 449.4, total_cita: 'Total: B/.449.40',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 1, precio_unitario: 420, importe: 420,
          cita: 'cantidad 1 x Parachoques delantero REP-F-01 precio B/.420.00 importe B/.420.00',
        },
      ],
    },
    espera: { estado: 'CONFORME', requiereRevision: false, lineas: 1, objetado: 0 },
  },
  {
    id: 'INT-ARITMETICA-REAL-01',
    nota: 'Factura bien leída pero MAL hecha: 1 x B/.420.00 con importe B/.520.00. El motor debe objetar los B/.100.00 con su cláusula. Si la extracción la hubiera rechazado, este hallazgo nunca ocurriría.',
    texto:
      TEXTO_CAB +
      'cantidad 1 x Parachoques delantero REP-F-01 precio B/.420.00 importe B/.520.00\n' +
      'Subtotal: B/.520.00 ITBMS: B/.36.40 Total: B/.556.40',
    respuesta: {
      ...CAB,
      subtotal: 520, subtotal_cita: 'Subtotal: B/.520.00',
      itbms: 36.4, itbms_cita: 'ITBMS: B/.36.40',
      total: 556.4, total_cita: 'Total: B/.556.40',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 1, precio_unitario: 420, importe: 520,
          cita: 'cantidad 1 x Parachoques delantero REP-F-01 precio B/.420.00 importe B/.520.00',
        },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      requiereRevision: false,
      motivos: ['ARITMETICA_LINEA'],
      lineas: 1,
    },
  },
  {
    id: 'INT-AMBIGUA-01',
    nota: 'Las cuentas cuadran perfectamente, pero el documento no etiqueta los campos. El dictamen NO puede decir CONFORME mientras la lectura esté sin confirmar: este es el fallo que ninguna prueba por separado detectaba.',
    texto:
      TEXTO_CAB +
      'Parachoques delantero REP-F-01 1 420.00 420.00\n' +
      'Subtotal: B/.420.00 ITBMS: B/.29.40 Total: B/.449.40',
    respuesta: {
      ...CAB,
      subtotal: 420, subtotal_cita: 'Subtotal: B/.420.00',
      itbms: 29.4, itbms_cita: 'ITBMS: B/.29.40',
      total: 449.4, total_cita: 'Total: B/.449.40',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 1, precio_unitario: 420, importe: 420,
          cita: 'Parachoques delantero REP-F-01 1 420.00 420.00',
        },
      ],
    },
    espera: { estado: 'PENDIENTE', requiereRevision: true, lineas: 1 },
  },
  {
    id: 'INT-ETIQUETA-PARCIAL-01',
    nota: 'Solo el importe está etiquetado. Aunque coincida, no verifica cantidad ni precio: la ausencia de etiqueta no es evidencia favorable.',
    texto:
      TEXTO_CAB +
      'Parachoques delantero REP-F-01 2 x 210 importe 420\n' +
      'Subtotal: B/.420.00 ITBMS: B/.29.40 Total: B/.449.40',
    respuesta: {
      ...CAB,
      subtotal: 420, subtotal_cita: 'Subtotal: B/.420.00',
      itbms: 29.4, itbms_cita: 'ITBMS: B/.29.40',
      total: 449.4, total_cita: 'Total: B/.449.40',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 2, precio_unitario: 210, importe: 420,
          cita: 'Parachoques delantero REP-F-01 2 x 210 importe 420',
        },
      ],
    },
    espera: { estado: 'PENDIENTE', requiereRevision: true },
  },
  {
    id: 'INT-INTERCAMBIO-DEMOSTRABLE-01',
    nota: 'El texto etiqueta "cantidad 1" y "precio B/.420.00"; el modelo los reporta al revés. Es demostrable, así que la línea se descarta y la factura queda sin líneas auditables.',
    texto:
      TEXTO_CAB +
      'cantidad 1 x Parachoques delantero REP-F-01 precio B/.420.00 importe B/.420.00\n' +
      'Subtotal: B/.420.00 ITBMS: B/.29.40 Total: B/.449.40',
    respuesta: {
      ...CAB,
      subtotal: 420, subtotal_cita: 'Subtotal: B/.420.00',
      itbms: 29.4, itbms_cita: 'ITBMS: B/.29.40',
      total: 449.4, total_cita: 'Total: B/.449.40',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 420, precio_unitario: 1, importe: 420,
          cita: 'cantidad 1 x Parachoques delantero REP-F-01 precio B/.420.00 importe B/.420.00',
        },
      ],
    },
    // La línea se descarta, así que la factura queda sin líneas: no es
    // auditable y la validación la rechaza antes de llegar al motor.
    espera: { estado: 'INVALIDA', requiereRevision: true, lineas: 0 },
  },
  {
    id: 'INT-AMBIGUA-CON-HALLAZGO-01',
    nota: 'Lectura ambigua Y sobreprecio a la vez. El estado tiene que reflejar la revisión pendiente, sin perder el hallazgo económico.',
    texto:
      TEXTO_CAB +
      'Parachoques delantero REP-F-01 1 500.00 500.00\n' +
      'Subtotal: B/.500.00 ITBMS: B/.35.00 Total: B/.535.00',
    respuesta: {
      ...CAB,
      subtotal: 500, subtotal_cita: 'Subtotal: B/.500.00',
      itbms: 35, itbms_cita: 'ITBMS: B/.35.00',
      total: 535, total_cita: 'Total: B/.535.00',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 1, precio_unitario: 500, importe: 500,
          cita: 'Parachoques delantero REP-F-01 1 500.00 500.00',
        },
      ],
    },
    espera: {
      estado: 'PENDIENTE',
      requiereRevision: true,
      motivos: ['SOBREPRECIO'],
      lineas: 1,
    },
  },
  {
    id: 'INT-CODIGO-CON-DIGITOS-01',
    nota: 'El código REP-F-01 termina en dígitos y está pegado a la etiqueta "precio". Ese 01 no es una cifra: si se lee como candidato, fabrica una ambigüedad que el texto no tiene y una factura bien etiquetada sale PENDIENTE sin motivo.',
    texto:
      TEXTO_CAB +
      'Guardafango REP-F-06 cantidad 3 precio B/.265.00 importe B/.795.00\n' +
      'Subtotal: B/.795.00 ITBMS: B/.55.65 Total: B/.850.65',
    respuesta: {
      ...CAB,
      subtotal: 795, subtotal_cita: 'Subtotal: B/.795.00',
      itbms: 55.65, itbms_cita: 'ITBMS: B/.55.65',
      total: 850.65, total_cita: 'Total: B/.850.65',
      lineas: [
        {
          codigo: 'REP-F-06', descripcion: 'Guardafango',
          cantidad: 3, precio_unitario: 265, importe: 795,
          cita: 'Guardafango REP-F-06 cantidad 3 precio B/.265.00 importe B/.795.00',
        },
      ],
    },
    // El "05" del código es el único número que podría confundirse con el
    // precio: ninguna otra etiqueta lo reclama. Si se leyera como cifra, esta
    // factura bien etiquetada saldría PENDIENTE sin ninguna razón.
    espera: { estado: 'CONFORME', requiereRevision: false, lineas: 1, objetado: 0 },
  },
  {
    id: 'INT-ETIQUETA-AMBIGUA-01',
    nota: 'El texto dice "2 unidades 100": la etiqueta tiene números a los dos lados y ninguna lectura es demostrable. El dictamen no puede declararse conforme mientras eso no lo confirme una persona.',
    texto:
      TEXTO_CAB +
      'Parachoques delantero REP-F-01 2 unidades 100 importe 200\n' +
      'Subtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      ...CAB,
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 2, precio_unitario: 100, importe: 200,
          cita: 'Parachoques delantero REP-F-01 2 unidades 100 importe 200',
        },
      ],
    },
    espera: { estado: 'PENDIENTE', requiereRevision: true },
  },
];

let ok = 0;
const fallos: string[] = [];

for (const c of CASOS) {
  const problemas: string[] = [];
  let extraccion;
  let dictamen;
  try {
    extraccion = aFacturaCruda(c.respuesta, c.texto);
    // Exactamente lo que hace app/api/extraer/route.ts.
    dictamen = auditar(extraccion.factura, env, extraccion.ambiguas);
  } catch (e) {
    fallos.push(`${c.id}: el recorrido reventó — ${(e as Error).message}`);
    continue;
  }

  if (dictamen.estado !== c.espera.estado) {
    problemas.push(`estado ${dictamen.estado}, se esperaba ${c.espera.estado}`);
  }
  if (dictamen.requiereRevision !== c.espera.requiereRevision) {
    problemas.push(
      `requiereRevision ${dictamen.requiereRevision}, se esperaba ${c.espera.requiereRevision}`,
    );
  }

  const codigos = new Set([
    ...dictamen.motivosFactura.map((m) => m.codigo),
    ...dictamen.lineas.flatMap((l) => l.motivos.map((m) => m.codigo)),
  ]);
  for (const m of c.espera.motivos ?? []) {
    if (!codigos.has(m)) problemas.push(`falta el motivo ${m}`);
  }
  if (c.espera.lineas !== undefined && dictamen.lineas.length !== c.espera.lineas) {
    problemas.push(`${dictamen.lineas.length} líneas auditadas, se esperaban ${c.espera.lineas}`);
  }
  if (c.espera.objetado !== undefined && dictamen.totalObjetado !== c.espera.objetado) {
    problemas.push(
      `objetado ${formato(dictamen.totalObjetado)}, se esperaba ${formato(c.espera.objetado)}`,
    );
  }

  // LA invariante de este archivo: un aviso de lectura sin confirmar y un
  // dictamen conforme no pueden coexistir. Es la contradicción que se le
  // mostraba al perito.
  if (extraccion.ambiguas.length > 0 && dictamen.estado === 'CONFORME') {
    problemas.push('CONFORME con una lectura marcada como pendiente de confirmar');
  }
  if (extraccion.ambiguas.length > 0 && !dictamen.requiereRevision) {
    problemas.push('lectura ambigua que no exige revisión');
  }

  if (problemas.length === 0) ok++;
  else fallos.push(`${c.id}: ${problemas.join(' · ')}`);
}

console.log('');
console.log('  INTEGRACION — extracción + motor, el recorrido completo');
console.log('  ' + '-'.repeat(62));
console.log(`  Casos ${ok} de ${CASOS.length}`);
if (fallos.length) {
  console.log('');
  console.log('  Fallos:');
  for (const f of fallos) console.log(`    ${f}`);
}
console.log('');
process.exit(fallos.length ? 1 : 0);
