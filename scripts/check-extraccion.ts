// Pruebas de la conversión "respuesta del modelo" → "factura auditable".
// No llaman a Anthropic ni usan una clave: simulan lo que el modelo pudo
// haber respondido, exactamente como lo haría el modelo real, y comprueban
// que aFacturaCruda() reaccione bien tanto a una respuesta correcta como a
// una que intenta hacer pasar un dato inventado por uno citado.
//
//   node --experimental-strip-types scripts/check-extraccion.ts

import { aFacturaCruda } from '../src/ia/extraccion.ts';
import { validarFactura } from '../src/dominio/validacion.ts';

interface Caso {
  id: string;
  nota: string;
  texto: string;
  respuesta: unknown;
  espera: { huecosMinimos: number; lineasResultantes: number; factCompleta: boolean; ambiguasMinimas?: number };
}

const CASOS: Caso[] = [
  {
    id: 'CORRECTA-01',
    nota: 'Cada campo cita exactamente el fragmento de donde sale su valor. Cero huecos.',
    texto:
      'Factura FAC-9001, siniestro SIN-2026-0141, taller TLR-001, placa AB1234, fecha 2026-07-20.\n' +
      '1x Parachoques delantero (REP-F-01) B/.470.00\nSubtotal: B/.470.00\nITBMS (7%): B/.32.90\nTotal: B/.502.90',
    respuesta: {
      numero: 'FAC-9001', numero_cita: 'Factura FAC-9001',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 470, subtotal_cita: 'Subtotal: B/.470.00',
      itbms: 32.9, itbms_cita: 'ITBMS (7%): B/.32.90',
      total: 502.9, total_cita: 'Total: B/.502.90',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Parachoques delantero',
          cantidad: 1, precio_unitario: 470, importe: 470,
          cita: '1x Parachoques delantero (REP-F-01) B/.470.00',
        },
      ],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'ATAQUE-CITA-GENERICA-01',
    nota: 'Todos los campos citan la única palabra del documento ("Factura"). Ningún dato debe pasar.',
    texto: 'Factura',
    respuesta: {
      numero: 'FAC-INVENTADA-001', numero_cita: 'Factura',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'Factura',
      taller: 'TLR-001', taller_cita: 'Factura',
      placa: 'AB1234', placa_cita: 'Factura',
      fecha: '2026-07-20', fecha_cita: 'Factura',
      subtotal: 500, subtotal_cita: 'Factura',
      itbms: 35, itbms_cita: 'Factura',
      total: 535, total_cita: 'Factura',
      lineas: [
        { codigo: 'REP-F-01', descripcion: 'Inventado', cantidad: 1, precio_unitario: 500, importe: 500, cita: 'Factura' },
      ],
    },
    espera: { huecosMinimos: 9, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'CITA-PARCIAL-01',
    nota: 'La cita de la línea solo contiene el total de la factura, no la cantidad ni el precio de esa línea. Se descarta igual: una cita no puede prestarle un número a otro dato.',
    texto: 'F1 S1 T1 P1 2026-01-01 1 1 1 Total: B/.470.00',
    respuesta: {
      numero: 'F1', numero_cita: 'F1', siniestro: 'S1', siniestro_cita: 'S1',
      taller: 'T1', taller_cita: 'T1', placa: 'P1', placa_cita: 'P1',
      fecha: '2026-01-01', fecha_cita: '2026-01-01',
      subtotal: 1, subtotal_cita: '1', itbms: 1, itbms_cita: '1', total: 1, total_cita: '1',
      lineas: [
        { codigo: 'X', descripcion: 'algo', cantidad: 5, precio_unitario: 999, importe: 470, cita: 'Total: B/.470.00' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'CAMPOS-AUSENTES-01',
    nota: 'El modelo no reportó casi nada. No revienta: cada campo faltante es un hueco explicado.',
    texto: 'texto irrelevante',
    respuesta: { lineas: [] },
    espera: { huecosMinimos: 8, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'MALFORMADA-01',
    nota: '"lineas" no es un arreglo, es un texto. No debe reventar: se trata como cero líneas.',
    texto: 'algo',
    respuesta: { lineas: 'no es un array' },
    espera: { huecosMinimos: 8, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'MALFORMADA-02',
    nota: 'La respuesta completa es null. No debe reventar.',
    texto: 'algo',
    respuesta: null,
    espera: { huecosMinimos: 8, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'CODIGO-INVENTADO-01',
    nota: 'La cantidad, precio e importe SÍ están en la cita, pero el código de tarifario que el modelo reporta no aparece ahí — es un dato pegado de otra parte del documento.',
    texto: 'Factura F2 siniestro S2 taller T2 placa P2 fecha 2026-01-01\n1 x Pieza sin nombre B/.100.00\nCódigo real: REP-F-01\nSubtotal: B/.100.00 ITBMS: B/.7.00 Total: B/.107.00',
    respuesta: {
      numero: 'F2', numero_cita: 'Factura F2', siniestro: 'S2', siniestro_cita: 'siniestro S2',
      taller: 'T2', taller_cita: 'taller T2', placa: 'P2', placa_cita: 'placa P2',
      fecha: '2026-01-01', fecha_cita: 'fecha 2026-01-01',
      subtotal: 100, subtotal_cita: 'Subtotal: B/.100.00',
      itbms: 7, itbms_cita: 'ITBMS: B/.7.00',
      total: 107, total_cita: 'Total: B/.107.00',
      lineas: [
        {
          codigo: 'REP-F-01', descripcion: 'Pieza sin nombre',
          cantidad: 1, precio_unitario: 100, importe: 100,
          cita: '1 x Pieza sin nombre B/.100.00',
        },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'CITA-AJENA-01',
    nota: 'La cita existe en el documento, pero pertenece a OTRA línea. El número citado no corresponde al valor reportado.',
    texto:
      'Factura F3 siniestro S3 taller T3 placa P3 fecha 2026-01-01\n1 x Farol B/.310.00\n1 x Capo B/.580.00\nSubtotal: B/.890.00 ITBMS: B/.62.30 Total: B/.952.30',
    respuesta: {
      numero: 'F3', numero_cita: 'Factura F3', siniestro: 'S3', siniestro_cita: 'siniestro S3',
      taller: 'T3', taller_cita: 'taller T3', placa: 'P3', placa_cita: 'placa P3',
      fecha: '2026-01-01', fecha_cita: 'fecha 2026-01-01',
      subtotal: 890, subtotal_cita: 'Subtotal: B/.890.00',
      itbms: 62.3, itbms_cita: 'ITBMS: B/.62.30',
      total: 952.3, total_cita: 'Total: B/.952.30',
      lineas: [
        { descripcion: 'Capo', cantidad: 1, precio_unitario: 580, importe: 580, cita: '1 x Farol B/.310.00' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'CITA-VACIA-01',
    nota: 'Citas presentes pero vacias o solo espacios. No son citas.',
    texto: 'Factura F4 con algo de contenido',
    respuesta: {
      numero: 'F4', numero_cita: '   ',
      siniestro: 'S4', siniestro_cita: '',
      taller: 'T4', taller_cita: null,
      placa: 'P4', placa_cita: undefined,
      fecha: '2026-01-01', fecha_cita: '\n',
      subtotal: 1, subtotal_cita: '', itbms: 1, itbms_cita: '', total: 1, total_cita: '',
      lineas: [],
    },
    espera: { huecosMinimos: 8, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'CITA-TIPO-INCORRECTO-01',
    nota: 'La cita es un numero o un objeto en vez de texto. No debe reventar ni aceptarse.',
    texto: 'Factura F5',
    respuesta: {
      numero: 'F5', numero_cita: 12345,
      siniestro: 'S5', siniestro_cita: { a: 1 },
      taller: 'T5', taller_cita: ['F5'],
      placa: 'P5', placa_cita: true,
      fecha: '2026-01-01', fecha_cita: 0,
      subtotal: 1, subtotal_cita: 1, itbms: 1, itbms_cita: 1, total: 1, total_cita: 1,
      lineas: [{ descripcion: 'x', cantidad: 1, precio_unitario: 1, importe: 1, cita: 99 }],
    },
    espera: { huecosMinimos: 9, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'NUMEROS-NO-FINITOS-01',
    nota: 'El modelo devuelve NaN e Infinity. Ninguno puede entrar al motor.',
    texto: 'Factura F6 total B/.100.00',
    respuesta: {
      numero: 'F6', numero_cita: 'Factura F6',
      siniestro: 'S6', siniestro_cita: 'Factura F6',
      taller: 'T6', taller_cita: 'Factura F6',
      placa: 'P6', placa_cita: 'Factura F6',
      fecha: '2026-01-01', fecha_cita: 'Factura F6',
      subtotal: NaN, subtotal_cita: 'total B/.100.00',
      itbms: Infinity, itbms_cita: 'total B/.100.00',
      total: 100, total_cita: 'total B/.100.00',
      lineas: [{ descripcion: 'x', cantidad: NaN, precio_unitario: 100, importe: 100, cita: 'total B/.100.00' }],
    },
    espera: { huecosMinimos: 3, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'DESCRIPCION-AUSENTE-01',
    nota: 'Linea con numeros correctos y citados, pero sin descripcion. Se descarta: una objecion sin decir sobre que partida no sirve.',
    texto:
      'Factura F7 siniestro S7 taller T7 placa P7 fecha 2026-01-01\n1 x B/.100.00\nSubtotal: B/.100.00 ITBMS: B/.7.00 Total: B/.107.00',
    respuesta: {
      numero: 'F7', numero_cita: 'Factura F7', siniestro: 'S7', siniestro_cita: 'siniestro S7',
      taller: 'T7', taller_cita: 'taller T7', placa: 'P7', placa_cita: 'placa P7',
      fecha: '2026-01-01', fecha_cita: 'fecha 2026-01-01',
      subtotal: 100, subtotal_cita: 'Subtotal: B/.100.00',
      itbms: 7, itbms_cita: 'ITBMS: B/.7.00',
      total: 107, total_cita: 'Total: B/.107.00',
      lineas: [{ descripcion: '   ', cantidad: 1, precio_unitario: 100, importe: 100, cita: '1 x B/.100.00' }],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'ESPACIOS-RAROS-01',
    nota: 'Cita con saltos de linea y espacios dobles, como sale de copiar un PDF. Debe pasar: la normalizacion existe para esto.',
    texto:
      'Factura   F8\n\nsiniestro S8   taller T8\nplaca P8    fecha 2026-01-01\n1 x Parachoques\n  B/.420.00\nSubtotal: B/.420.00 ITBMS: B/.29.40 Total: B/.449.40',
    respuesta: {
      numero: 'F8', numero_cita: 'Factura F8',
      siniestro: 'S8', siniestro_cita: 'siniestro S8',
      taller: 'T8', taller_cita: 'taller T8',
      placa: 'P8', placa_cita: 'placa P8',
      fecha: '2026-01-01', fecha_cita: 'fecha 2026-01-01',
      subtotal: 420, subtotal_cita: 'Subtotal: B/.420.00',
      itbms: 29.4, itbms_cita: 'ITBMS: B/.29.40',
      total: 449.4, total_cita: 'Total: B/.449.40',
      lineas: [{ descripcion: 'Parachoques', cantidad: 1, precio_unitario: 420, importe: 420, cita: '1 x Parachoques B/.420.00' }],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'MILES-CON-COMA-01',
    nota: 'Importe con separador de miles (B/.1,250.00). El lector debe reconocer que 1250 esta en esa cita.',
    texto:
      'Factura F9 siniestro S9 taller T9 placa P9 fecha 2026-01-01\n1 x Motor B/.1,250.00\nSubtotal: B/.1,250.00 ITBMS: B/.87.50 Total: B/.1,337.50',
    respuesta: {
      numero: 'F9', numero_cita: 'Factura F9', siniestro: 'S9', siniestro_cita: 'siniestro S9',
      taller: 'T9', taller_cita: 'taller T9', placa: 'P9', placa_cita: 'placa P9',
      fecha: '2026-01-01', fecha_cita: 'fecha 2026-01-01',
      subtotal: 1250, subtotal_cita: 'Subtotal: B/.1,250.00',
      itbms: 87.5, itbms_cita: 'ITBMS: B/.87.50',
      total: 1337.5, total_cita: 'Total: B/.1,337.50',
      lineas: [{ descripcion: 'Motor', cantidad: 1, precio_unitario: 1250, importe: 1250, cita: '1 x Motor B/.1,250.00' }],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'LINEAS-MIXTAS-01',
    nota: 'Tres lineas: una con cita buena, una con cita ajena, una sin cita. Solo la primera debe sobrevivir.',
    texto:
      'Factura FA siniestro SA taller TA placa PA fecha 2026-01-01\n1 x Farol B/.310.00\n1 x Capo B/.580.00\nSubtotal: B/.890.00 ITBMS: B/.62.30 Total: B/.952.30',
    respuesta: {
      numero: 'FA', numero_cita: 'Factura FA', siniestro: 'SA', siniestro_cita: 'siniestro SA',
      taller: 'TA', taller_cita: 'taller TA', placa: 'PA', placa_cita: 'placa PA',
      fecha: '2026-01-01', fecha_cita: 'fecha 2026-01-01',
      subtotal: 890, subtotal_cita: 'Subtotal: B/.890.00',
      itbms: 62.3, itbms_cita: 'ITBMS: B/.62.30',
      total: 952.3, total_cita: 'Total: B/.952.30',
      lineas: [
        { descripcion: 'Farol', cantidad: 1, precio_unitario: 310, importe: 310, cita: '1 x Farol B/.310.00' },
        { descripcion: 'Capo', cantidad: 1, precio_unitario: 580, importe: 580, cita: '1 x Farol B/.310.00' },
        { descripcion: 'Fantasma', cantidad: 1, precio_unitario: 999, importe: 999, cita: 'no existe en el documento' },
      ],
    },
    espera: { huecosMinimos: 2, lineasResultantes: 1, factCompleta: false },
  },
  {
    id: 'INTERCAMBIO-CANT-PRECIO-01',
    nota: 'El documento dice 2 unidades a B/.100. El modelo reporta cantidad 100 y precio 2. Los tres numeros estan en la cita y la multiplicacion sigue dando 200: solo el ORDEN delata el intercambio.',
    texto:
      'Factura F1 siniestro S1 taller T1 placa P1 fecha 2026-07-20\n2 unidades x Parachoques precio B/.100.00 importe B/.200.00\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1', siniestro: 'S1', siniestro_cita: 'siniestro S1',
      taller: 'T1', taller_cita: 'taller T1', placa: 'P1', placa_cita: 'placa P1',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'Parachoques', cantidad: 100, precio_unitario: 2, importe: 200,
          cita: '2 unidades x Parachoques precio B/.100.00 importe B/.200.00' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'ORDEN-CORRECTO-01',
    nota: 'La misma linea con cantidad y precio en su papel correcto. Debe pasar: la regla del orden no puede rechazar lo legitimo.',
    texto:
      'Factura F1 siniestro S1 taller T1 placa P1 fecha 2026-07-20\n2 unidades x Parachoques precio B/.100.00 importe B/.200.00\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1', siniestro: 'S1', siniestro_cita: 'siniestro S1',
      taller: 'T1', taller_cita: 'taller T1', placa: 'P1', placa_cita: 'placa P1',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'Parachoques', cantidad: 2, precio_unitario: 100, importe: 200,
          cita: '2 unidades x Parachoques precio B/.100.00 importe B/.200.00' },
      ],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'ARITMETICA-INCOHERENTE-01',
    nota: 'Los tres numeros estan en la cita pero 2 x 100 no da 500. La tercia debe ser coherente entre si.',
    texto:
      'Factura F1 siniestro S1 taller T1 placa P1 fecha 2026-07-20\n2 x Pieza B/.100.00 total linea B/.500.00\nSubtotal: B/.500.00 ITBMS: B/.35.00 Total: B/.535.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1', siniestro: 'S1', siniestro_cita: 'siniestro S1',
      taller: 'T1', taller_cita: 'taller T1', placa: 'P1', placa_cita: 'placa P1',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 500, subtotal_cita: 'Subtotal: B/.500.00',
      itbms: 35, itbms_cita: 'ITBMS: B/.35.00',
      total: 535, total_cita: 'Total: B/.535.00',
      lineas: [
        { descripcion: 'Pieza', cantidad: 2, precio_unitario: 100, importe: 500,
          cita: '2 x Pieza B/.100.00 total linea B/.500.00' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'DESCRIPCION-INVENTADA-01',
    nota: 'Numeros correctos y citados, pero la descripcion no aparece en ninguna parte del documento.',
    texto:
      'Factura F1 siniestro S1 taller T1 placa P1 fecha 2026-07-20\n2 unidades x Parachoques precio B/.100.00 importe B/.200.00\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1', siniestro: 'S1', siniestro_cita: 'siniestro S1',
      taller: 'T1', taller_cita: 'taller T1', placa: 'P1', placa_cita: 'placa P1',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'Texto inventado que no esta en la fuente', cantidad: 2, precio_unitario: 100, importe: 200,
          cita: '2 unidades x Parachoques precio B/.100.00 importe B/.200.00' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'CALIDAD-INVENTADA-01',
    nota: 'La calidad "usado" nunca aparece en el documento. Se omite el campo, pero la linea sobrevive: la calidad no es obligatoria.',
    texto:
      'Factura F1 siniestro S1 taller T1 placa P1 fecha 2026-07-20\n2 unidades x Parachoques precio B/.100.00 importe B/.200.00\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1', siniestro: 'S1', siniestro_cita: 'siniestro S1',
      taller: 'T1', taller_cita: 'taller T1', placa: 'P1', placa_cita: 'placa P1',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'Parachoques', calidad: 'usado', cantidad: 2, precio_unitario: 100, importe: 200,
          cita: '2 unidades x Parachoques precio B/.100.00 importe B/.200.00' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'LINEA-NULL-01',
    nota: 'Un null dentro del arreglo de lineas. Antes reventaba la conversion entera.',
    texto: 'Factura FB con contenido',
    respuesta: { lineas: [null] },
    espera: { huecosMinimos: 8, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'LINEA-TIPOS-VARIOS-01',
    nota: 'Numeros, cadenas y arreglos donde deberia haber objetos de linea. Ninguno revienta.',
    texto: 'Factura FC con contenido',
    respuesta: { lineas: [42, 'texto', [], null, undefined] },
    espera: { huecosMinimos: 8, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'FECHA-BARRAS-01',
    nota: 'El documento escribe 20/07/2026 y el modelo normaliza a 2026-07-20. Son la misma fecha: debe aceptarse.',
    texto:
      'Factura F2 siniestro S2 taller T2 placa P2 Fecha 20/07/2026\n1 x Pieza B/.100.00\nSubtotal: B/.100.00 ITBMS: B/.7.00 Total: B/.107.00',
    respuesta: {
      numero: 'F2', numero_cita: 'Factura F2', siniestro: 'S2', siniestro_cita: 'siniestro S2',
      taller: 'T2', taller_cita: 'taller T2', placa: 'P2', placa_cita: 'placa P2',
      fecha: '2026-07-20', fecha_cita: 'Fecha 20/07/2026',
      subtotal: 100, subtotal_cita: 'Subtotal: B/.100.00',
      itbms: 7, itbms_cita: 'ITBMS: B/.7.00',
      total: 107, total_cita: 'Total: B/.107.00',
      lineas: [{ descripcion: 'Pieza', cantidad: 1, precio_unitario: 100, importe: 100, cita: '1 x Pieza B/.100.00' }],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'FECHA-AJENA-01',
    nota: 'El modelo normaliza a una fecha que NO es la del documento. No debe aceptarse.',
    texto:
      'Factura F2 siniestro S2 taller T2 placa P2 Fecha 20/07/2026\n1 x Pieza B/.100.00\nSubtotal: B/.100.00 ITBMS: B/.7.00 Total: B/.107.00',
    respuesta: {
      numero: 'F2', numero_cita: 'Factura F2', siniestro: 'S2', siniestro_cita: 'siniestro S2',
      taller: 'T2', taller_cita: 'taller T2', placa: 'P2', placa_cita: 'placa P2',
      fecha: '2026-01-15', fecha_cita: 'Fecha 20/07/2026',
      subtotal: 100, subtotal_cita: 'Subtotal: B/.100.00',
      itbms: 7, itbms_cita: 'ITBMS: B/.7.00',
      total: 107, total_cita: 'Total: B/.107.00',
      lineas: [{ descripcion: 'Pieza', cantidad: 1, precio_unitario: 100, importe: 100, cita: '1 x Pieza B/.100.00' }],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 1, factCompleta: false },
  },
  {
    id: 'FIEL-DE-FACTURA-INCORRECTA-01',
    nota: 'La factura dice 2 unidades a B/.100 con importe B/.250. Esta MAL, y el modelo la leyo BIEN. Debe llegar entera al motor, que la objetara por ARITMETICA_LINEA con sus B/.50.00. Rechazarla aqui impediria auditar justo lo que hay que auditar.',
    texto:
      'Factura F1 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\n2 unidades x Parachoques precio B/.100.00 importe B/.250.00\nSubtotal: B/.250.00 ITBMS: B/.17.50 Total: B/.267.50',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 250, subtotal_cita: 'Subtotal: B/.250.00',
      itbms: 17.5, itbms_cita: 'ITBMS: B/.17.50',
      total: 267.5, total_cita: 'Total: B/.267.50',
      lineas: [
        { descripcion: 'Parachoques', cantidad: 2, precio_unitario: 100, importe: 250,
          cita: '2 unidades x Parachoques precio B/.100.00 importe B/.250.00' },
      ],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'PRECIO-ANTES-QUE-CANTIDAD-01',
    nota: 'El documento pone el precio antes que la cantidad. La extraccion es correcta. La regla vieja lo rechazaba por posicion; las etiquetas lo resuelven sin importar el orden.',
    texto:
      'Factura F2 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\nPrecio B/.100.00 cantidad 2 importe B/.200.00\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F2', numero_cita: 'Factura F2',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'Precio', cantidad: 2, precio_unitario: 100, importe: 200,
          cita: 'Precio B/.100.00 cantidad 2 importe B/.200.00' },
      ],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true },
  },
  {
    id: 'INTERCAMBIO-CON-ETIQUETAS-01',
    nota: 'El texto etiqueta explicitamente "cantidad 2" y "precio B/.100.00", y el modelo los reporta al reves. Con etiquetas presentes, el intercambio es demostrable y se rechaza.',
    texto:
      'Factura F3 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\ncantidad 2 x Parachoques precio B/.100.00 importe B/.200.00\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F3', numero_cita: 'Factura F3',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'Parachoques', cantidad: 100, precio_unitario: 2, importe: 200,
          cita: 'cantidad 2 x Parachoques precio B/.100.00 importe B/.200.00' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'SIN-ETIQUETAS-AMBIGUA-01',
    nota: 'La cita no trae ninguna etiqueta: solo numeros sueltos. No hay como probar cual es cual, asi que se acepta la lectura pero se marca para que una persona la confirme. No se adivina por posicion.',
    texto:
      'Factura F4 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\nParachoques 2 100.00 200.00\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F4', numero_cita: 'Factura F4',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'Parachoques', cantidad: 2, precio_unitario: 100, importe: 200,
          cita: 'Parachoques 2 100.00 200.00' },
      ],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true, ambiguasMinimas: 1 },
  },
  {
    id: 'ETIQUETA-AMBOS-LADOS-01',
    nota: 'El texto dice "2 unidades 100": la etiqueta tiene numeros a los dos lados y las dos lecturas son defendibles. Antes se elegia una en silencio y se rechazaba la extraccion correcta. Ahora pide confirmacion nombrando ambas.',
    texto:
      'Factura F1 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\n2 unidades 100 importe 200\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'unidades', cantidad: 2, precio_unitario: 100, importe: 200,
          cita: '2 unidades 100 importe 200' },
      ],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true, ambiguasMinimas: 1 },
  },
  {
    id: 'ETIQUETA-AMBOS-LADOS-02',
    nota: 'Mismo formato ambiguo, pero el modelo reporta un numero que NO esta entre los candidatos de la etiqueta. Eso sigue siendo una contradiccion demostrable: se rechaza.',
    texto:
      'Factura F1 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\n2 unidades 100 importe 200\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'unidades', cantidad: 200, precio_unitario: 1, importe: 200,
          cita: '2 unidades 100 importe 200' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
  {
    id: 'ETIQUETA-INEQUIVOCA-01',
    nota: 'Cuando la etiqueta tiene numero de UN solo lado, no hay ambiguedad: se verifica sin pedir confirmacion.',
    texto:
      'Factura F1 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\ncantidad 2 precio 100 importe 200\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'cantidad', cantidad: 2, precio_unitario: 100, importe: 200,
          cita: 'cantidad 2 precio 100 importe 200' },
      ],
    },
    espera: { huecosMinimos: 0, lineasResultantes: 1, factCompleta: true, ambiguasMinimas: 0 },
  },
  {
    id: 'VALOR-FUERA-DE-CANDIDATOS-01',
    nota: 'La etiqueta "unidades" admite 100 o 2, y el modelo reporta 200 como cantidad. 200 existe en la cita, asi que la comprobacion de presencia no lo atrapa, pero no es ninguno de los candidatos de esa etiqueta: es una contradiccion, no una duda.',
    texto:
      'Factura F1 siniestro SIN-2026-0141 taller TLR-001 placa AB1234 fecha 2026-07-20\n2 unidades 100 importe 200 precio 50\nSubtotal: B/.200.00 ITBMS: B/.14.00 Total: B/.214.00',
    respuesta: {
      numero: 'F1', numero_cita: 'Factura F1',
      siniestro: 'SIN-2026-0141', siniestro_cita: 'siniestro SIN-2026-0141',
      taller: 'TLR-001', taller_cita: 'taller TLR-001',
      placa: 'AB1234', placa_cita: 'placa AB1234',
      fecha: '2026-07-20', fecha_cita: 'fecha 2026-07-20',
      subtotal: 200, subtotal_cita: 'Subtotal: B/.200.00',
      itbms: 14, itbms_cita: 'ITBMS: B/.14.00',
      total: 214, total_cita: 'Total: B/.214.00',
      lineas: [
        { descripcion: 'unidades', cantidad: 200, precio_unitario: 50, importe: 200,
          cita: '2 unidades 100 importe 200 precio 50' },
      ],
    },
    espera: { huecosMinimos: 1, lineasResultantes: 0, factCompleta: false },
  },
];

let ok = 0;
const fallos: string[] = [];

for (const c of CASOS) {
  let resultado;
  try {
    resultado = aFacturaCruda(c.respuesta as never, c.texto);
  } catch (e) {
    fallos.push(`${c.id}: aFacturaCruda revento — ${(e as Error).message}`);
    continue;
  }
  const problemas: string[] = [];
  if (resultado.huecos.length < c.espera.huecosMinimos) {
    problemas.push(`esperaba al menos ${c.espera.huecosMinimos} huecos, hubo ${resultado.huecos.length}`);
  }
  const lineas = (resultado.factura as { lineas?: unknown[] })?.lineas ?? [];
  if (lineas.length !== c.espera.lineasResultantes) {
    problemas.push(`esperaba ${c.espera.lineasResultantes} lineas resultantes, hubo ${lineas.length}`);
  }
  if (c.espera.ambiguasMinimas !== undefined && resultado.ambiguas.length < c.espera.ambiguasMinimas) {
    problemas.push(`esperaba al menos ${c.espera.ambiguasMinimas} lecturas ambiguas, hubo ${resultado.ambiguas.length}`);
  }
  if (c.espera.factCompleta) {
    const problemasDeForma = validarFactura(resultado.factura);
    if (problemasDeForma.length > 0) {
      problemas.push(`se esperaba una factura completa y valida, pero validarFactura encontro: ${problemasDeForma.join(' ')}`);
    }
  }
  if (problemas.length === 0) ok++;
  else fallos.push(`${c.id}: ${problemas.join(' · ')}`);
}

console.log('');
console.log('  EXTRACCION — conversion de respuesta del modelo a factura auditable');
console.log('  ' + '-'.repeat(70));
console.log(`  Casos ${ok} de ${CASOS.length}`);
if (fallos.length) {
  console.log('');
  console.log('  Fallos:');
  for (const f of fallos) console.log(`    ${f}`);
}
console.log('');
process.exit(fallos.length ? 1 : 0);
