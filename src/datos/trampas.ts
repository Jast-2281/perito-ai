// EL GUANTELETE.
//
// Cada caso declara lo que el motor DEBE dictaminar. La mitad son facturas
// limpias diseñadas para provocar una objeción falsa: bordes decimales, topes
// justos, palabras que suenan a fraude sin serlo. Una aprobación indebida es
// grave; una objeción falsa también, porque quema la relación con el taller y
// se la cobran a la aseguradora en la siguiente negociación.

import type { EspecFactura } from './constructor.ts';
import type { FacturaCruda } from '../dominio/tipos.ts';
import type { EstadoDictamen, MotivoCodigo } from '../dominio/tipos.ts';

export interface Trampa {
  id: string;
  nota: string;
  /**
   * Normalmente una especificación que construirFactura() convierte en
   * FacturaCruda. Cuando `crudo` es true, `factura` YA es lo que se le pasa
   * al motor tal cual — incluida entrada malformada como null o undefined —
   * para probar la puerta de validación de entrada, no el constructor.
   */
  factura: EspecFactura;
  crudo?: boolean;
  espera: {
    estado: EstadoDictamen;
    /** Códigos de motivo que deben aparecer. */
    motivos: MotivoCodigo[];
    /** Si se declara, suma exacta de lo objetado en líneas, en centavos. */
    objetadoLineas?: number;
    /** Si se declara, no debe aparecer ninguno de estos motivos. */
    prohibidos?: MotivoCodigo[];
  };
}

const S1 = 'SIN-2026-0141'; // frontal + mecánica, TLR-001, placa AB1234, alterno
const S2 = 'SIN-2026-0158'; // trasera, TLR-002, placa CD5678, indistinto
const S3 = 'SIN-2026-0163'; // lateral_izq, TLR-003, placa EF9012, original
const S4 = 'SIN-2026-0170'; // techo + frontal, TLR-004, placa GH3456, alterno
const S5 = 'SIN-2026-0112'; // CERRADO, TLR-001, placa IJ7890
const S6 = 'SIN-2026-0185'; // múltiple, TLR-002, placa KL2468, suma corta

export const TRAMPAS: Trampa[] = [
  // ---------------------------------------------------------------- limpias
  {
    id: 'LIMPIA-01',
    nota: 'Factura correcta de principio a fin. Si esta se objeta, el motor no sirve.',
    factura: {
      numero: 'FAC-1001',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-PIN-01', cantidad: 5 },
      ],
    },
    espera: { estado: 'CONFORME', motivos: [], objetadoLineas: 0 },
  },
  {
    id: 'LIMPIA-02',
    nota: 'Horas decimales exactamente en el estándar (1.5 h). Borde de coma flotante.',
    factura: {
      numero: 'FAC-1002',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-21',
      lineas: [
        { codigo: 'MO-ALI-01', cantidad: 1.5 },
        { codigo: 'REP-M-02', cantidad: 2 },
      ],
    },
    espera: {
      estado: 'CONFORME',
      motivos: [],
      objetadoLineas: 0,
      prohibidos: ['HORAS_EXCEDIDAS', 'ARITMETICA_LINEA'],
    },
  },
  {
    id: 'LIMPIA-03',
    nota: 'Cantidad 0.1 a B/.35.00. En coma flotante, 0.1*100 da 10.000000000000002.',
    factura: {
      numero: 'FAC-1003',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-21',
      lineas: [
        { codigo: 'MO-DIA-01', cantidad: 0.1 },
        { codigo: 'REP-F-01', cantidad: 1 },
      ],
    },
    espera: {
      estado: 'CONFORME',
      motivos: [],
      objetadoLineas: 0,
      prohibidos: ['ARITMETICA_LINEA'],
    },
  },
  {
    id: 'LIMPIA-04',
    nota: 'Materiales exactamente en el 35% de la mano de obra. Borde del tope.',
    factura: {
      numero: 'FAC-1004',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-22',
      lineas: [
        { codigo: 'MO-DES-01', cantidad: 4 }, // 112.00
        { codigo: 'MO-PIN-01', cantidad: 4 }, // 128.00 -> MO = 240.00, tope = 84.00
        { codigo: 'MAT-ABR-01', cantidad: 7 }, // 84.00 exacto
      ],
    },
    espera: {
      estado: 'CONFORME',
      motivos: [],
      objetadoLineas: 0,
      prohibidos: ['TOPE_MATERIALES'],
    },
  },
  {
    id: 'LIMPIA-05',
    nota: 'Repuesto alterno con póliza de calidad indistinta: no es objeción.',
    factura: {
      numero: 'FAC-1005',
      siniestro: S2,
      taller: 'TLR-002',
      placa: 'CD5678',
      fecha: '2026-07-30',
      lineas: [
        { codigo: 'REP-T-01', cantidad: 1, calidad: 'alterno' },
        { codigo: 'REP-T-02', cantidad: 1, calidad: 'original' },
      ],
    },
    espera: {
      estado: 'CONFORME',
      motivos: [],
      objetadoLineas: 0,
      prohibidos: ['CALIDAD_NO_PACTADA'],
    },
  },
  {
    id: 'LIMPIA-06',
    nota: 'Mano de obra de zona general en un siniestro lateral: coherente.',
    factura: {
      numero: 'FAC-1006',
      siniestro: S3,
      taller: 'TLR-003',
      placa: 'EF9012',
      fecha: '2026-08-05',
      lineas: [
        { codigo: 'REP-LI-01', cantidad: 1, calidad: 'original' },
        { codigo: 'MO-PIN-01', cantidad: 5 },
        { codigo: 'MO-ARM-01', cantidad: 3 },
      ],
    },
    espera: {
      estado: 'CONFORME',
      motivos: [],
      objetadoLineas: 0,
      prohibidos: ['ZONA_INCOHERENTE'],
    },
  },
  {
    id: 'LIMPIA-07',
    nota: 'El taller cobra de menos. Se deja constancia, no se objeta un centavo.',
    factura: {
      numero: 'FAC-1007',
      siniestro: S2,
      taller: 'TLR-002',
      placa: 'CD5678',
      fecha: '2026-07-31',
      lineas: [{ codigo: 'REP-T-04', cantidad: 1, importe: 450.0 }], // esperado 495.00
    },
    espera: { estado: 'CONFORME', motivos: ['ARITMETICA_LINEA'], objetadoLineas: 0 },
  },
  {
    id: 'LIMPIA-08',
    nota: 'La descripción dice "duplicado" pero el código es único. Trampa textual para un LLM.',
    factura: {
      numero: 'FAC-1008',
      siniestro: S2,
      taller: 'TLR-002',
      placa: 'CD5678',
      fecha: '2026-08-01',
      lineas: [
        {
          codigo: 'REP-T-05',
          descripcion: 'Panel trasero (reemplazo por juego duplicado de sellos de fábrica)',
          cantidad: 1,
        },
      ],
    },
    espera: {
      estado: 'CONFORME',
      motivos: [],
      objetadoLineas: 0,
      prohibidos: ['DUPLICADO_EN_FACTURA', 'DUPLICADO_ENTRE_FACTURAS'],
    },
  },

  // ------------------------------------------------------------ con objeción
  {
    id: 'SOBREPRECIO-01',
    nota: 'B/.470.00 por un parachoques tarifado en B/.420.00.',
    factura: {
      numero: 'FAC-2001',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1, precio: 470.0 },
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-PIN-01', cantidad: 5 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['SOBREPRECIO'], objetadoLineas: 5000 },
  },
  {
    id: 'SOBREPRECIO-02',
    nota: 'Sobreprecio multiplicado por cantidad: B/.20.00 de más en dos unidades.',
    factura: {
      numero: 'FAC-2002',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [
        { codigo: 'REP-F-09', cantidad: 2, precio: 140.0 }, // tarifa 120.00
        { codigo: 'REP-F-01', cantidad: 1 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['SOBREPRECIO'], objetadoLineas: 4000 },
  },
  {
    id: 'HORAS-01',
    nota: 'Seis horas de desabolladura donde el estándar reconoce cuatro.',
    factura: {
      numero: 'FAC-2003',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-26',
      lineas: [
        { codigo: 'MO-DES-01', cantidad: 6 },
        { codigo: 'REP-F-01', cantidad: 1 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['HORAS_EXCEDIDAS'], objetadoLineas: 5600 },
  },
  {
    id: 'HORAS-02',
    nota: 'Exceso de un cuarto de hora. El fraude pequeño es el que no se revisa.',
    factura: {
      numero: 'FAC-2004',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-26',
      lineas: [
        { codigo: 'MO-DES-01', cantidad: 4.25 },
        { codigo: 'REP-F-01', cantidad: 1 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['HORAS_EXCEDIDAS'], objetadoLineas: 700 },
  },
  {
    id: 'DUP-FACT-01',
    nota: 'El mismo farol facturado dos veces en la misma factura.',
    factura: {
      numero: 'FAC-2005',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-27',
      lineas: [
        { codigo: 'REP-F-02', cantidad: 1 },
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-F-02', cantidad: 1 },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['DUPLICADO_EN_FACTURA'],
      objetadoLineas: 31000,
    },
  },
  {
    id: 'DUP-PREV-01',
    nota: 'La rejilla ya se pagó en una factura anterior del mismo siniestro.',
    factura: {
      numero: 'FAC-2006',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-28',
      lineas: [
        { codigo: 'REP-F-05', cantidad: 1 },
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['DUPLICADO_ENTRE_FACTURAS'],
      objetadoLineas: 14500,
    },
  },
  {
    id: 'ZONA-01',
    nota: 'Un stop trasero en un impacto frontal. Nadie choca de frente por detrás.',
    factura: {
      numero: 'FAC-2007',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-28',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-F-04', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'REP-T-02', cantidad: 1 },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['ZONA_INCOHERENTE'],
      objetadoLineas: 21500,
    },
  },
  {
    id: 'ZONA-02',
    nota: 'Puerta izquierda en un siniestro de costado derecho.',
    factura: {
      numero: 'FAC-2008',
      siniestro: S6,
      taller: 'TLR-002',
      placa: 'KL2468',
      fecha: '2026-08-25',
      lineas: [
        { codigo: 'REP-LD-01', cantidad: 1 },
        { codigo: 'REP-LI-03', cantidad: 1 },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['ZONA_INCOHERENTE'],
      objetadoLineas: 18500,
    },
  },
  {
    id: 'CATALOGO-01',
    nota: 'Código que no existe en el tarifario: no es verificable, no se paga.',
    factura: {
      numero: 'FAC-2009',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-29',
      lineas: [
        { codigo: 'REP-X-99', descripcion: 'Kit de refuerzo estructural', cantidad: 1, precio: 150.0 },
        { codigo: 'REP-F-01', cantidad: 1 },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['FUERA_DE_TARIFARIO'],
      objetadoLineas: 15000,
    },
  },
  {
    id: 'CATALOGO-02',
    nota: 'Línea sin código. "Suministros varios" es el clásico cajón de sastre.',
    factura: {
      numero: 'FAC-2010',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-29',
      lineas: [
        { descripcion: 'Suministros varios de taller', cantidad: 1, precio: 85.0 },
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['FUERA_DE_TARIFARIO'],
      objetadoLineas: 8500,
    },
  },
  {
    id: 'ARIT-LINEA-01',
    nota: 'Precio y cantidad correctos, importe inflado. El error que nadie recalcula.',
    factura: {
      numero: 'FAC-2011',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-30',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1, importe: 520.0 }],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['ARITMETICA_LINEA'],
      objetadoLineas: 10000,
    },
  },
  {
    id: 'ARIT-TOTAL-01',
    nota: 'Las líneas suman bien; el subtotal declarado no. El documento no cierra consigo mismo, así que se devuelve al taller en vez de pagarse parcialmente.',
    factura: {
      numero: 'FAC-2012',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-30',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
      ],
      subtotal: 632.0, // real: 532.00
    },
    espera: { estado: 'PENDIENTE', motivos: ['ARITMETICA_TOTAL'], objetadoLineas: 0 },
  },
  {
    id: 'ITBMS-01',
    nota: 'ITBMS al 10% en vez del 7%.',
    factura: {
      numero: 'FAC-2013',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-30',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
      ],
      itbms: 53.2,
    },
    espera: { estado: 'PENDIENTE', motivos: ['ITBMS_INCORRECTO'], objetadoLineas: 0 },
  },
  {
    id: 'MATERIALES-01',
    nota: 'Materiales de pintura muy por encima del tope del 35%.',
    factura: {
      numero: 'FAC-2014',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-31',
      lineas: [
        { codigo: 'MO-PIN-01', cantidad: 5 }, // 160.00 -> tope 56.00
        { codigo: 'MAT-BAS-01', cantidad: 2 }, // 92.00
        { codigo: 'MAT-LAC-01', cantidad: 1 }, // 52.00
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['TOPE_MATERIALES'] },
  },
  {
    id: 'MATERIALES-BORDE-01',
    nota: 'Veinte centavos por encima del tope. El motor no perdona ni redondea.',
    factura: {
      numero: 'FAC-2015',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-31',
      lineas: [
        { codigo: 'MO-DES-01', cantidad: 4 }, // 112.00
        { codigo: 'MO-PIN-01', cantidad: 5 }, // 160.00 -> MO 272.00, tope 95.20
        { codigo: 'MAT-BAS-01', cantidad: 1 }, // 46.00
        { codigo: 'MAT-LAC-01', cantidad: 0.95 }, // 49.40 -> total 95.40
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['TOPE_MATERIALES'],
      objetadoLineas: 20,
    },
  },
  {
    id: 'CALIDAD-01',
    nota: 'Repuesto original con póliza que pacta alterno, al precio correcto: no se descuenta un centavo, pero tampoco se aprueba solo. Falta una autorización, no falta plata.',
    factura: {
      numero: 'FAC-2016',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-08-01',
      lineas: [{ codigo: 'REP-F-04', cantidad: 1, calidad: 'original' }],
    },
    espera: { estado: 'PENDIENTE', motivos: ['CALIDAD_NO_PACTADA'], objetadoLineas: 0 },
  },
  {
    id: 'SUMA-01',
    nota: 'Reparación legítima que supera la suma asegurada disponible.',
    factura: {
      numero: 'FAC-2017',
      siniestro: S6,
      taller: 'TLR-002',
      placa: 'KL2468',
      fecha: '2026-08-26',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 }, // 420
        { codigo: 'REP-F-04', cantidad: 1 }, // 580
        { codigo: 'REP-LD-01', cantidad: 1 }, // 610
        { codigo: 'REP-M-01', cantidad: 1 }, // 355
        { codigo: 'MO-DES-01', cantidad: 4 }, // 112
        { codigo: 'MO-PIN-01', cantidad: 5 }, // 160
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['EXCEDE_SUMA_ASEGURADA'], objetadoLineas: 0 },
  },
  {
    id: 'DERIVA-01',
    nota: 'Casi la mitad de la factura objetada: el agente no rechaza solo, deriva a un perito.',
    factura: {
      numero: 'FAC-2018',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-08-02',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 }, // 420 conforme
        { codigo: 'REP-T-01', cantidad: 1 }, // 385 zona incoherente
      ],
    },
    espera: { estado: 'DERIVADA', motivos: ['ZONA_INCOHERENTE'], objetadoLineas: 38500 },
  },

  // ------------------------------------------------- puertas: factura inválida
  {
    id: 'TALLER-01',
    nota: 'Taller fuera de la red.',
    factura: {
      numero: 'FAC-3001',
      siniestro: S1,
      taller: 'TLR-099',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['TALLER_NO_AUTORIZADO'] },
  },
  {
    id: 'TALLER-02',
    nota: 'Taller en la red, pero no es el asignado al siniestro.',
    factura: {
      numero: 'FAC-3002',
      siniestro: S1,
      taller: 'TLR-004',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['TALLER_NO_AUTORIZADO'] },
  },
  {
    id: 'PLACA-01',
    nota: 'La placa de la factura no es la del expediente.',
    factura: {
      numero: 'FAC-3003',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'ZZ9999',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['PLACA_NO_COINCIDE'] },
  },
  {
    id: 'FECHA-01',
    nota: 'Factura con fecha anterior al choque.',
    factura: {
      numero: 'FAC-3004',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-10',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['FACTURA_ANTERIOR_AL_SINIESTRO'] },
  },
  {
    id: 'FECHA-02',
    nota: 'Factura fuera de la vigencia de la póliza.',
    factura: {
      numero: 'FAC-3005',
      siniestro: S2,
      taller: 'TLR-002',
      placa: 'CD5678',
      fecha: '2026-12-01',
      lineas: [{ codigo: 'REP-T-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['FUERA_DE_VIGENCIA'] },
  },
  {
    id: 'CERRADO-01',
    nota: 'Facturación sobre un siniestro ya cerrado.',
    factura: {
      numero: 'FAC-3006',
      siniestro: S5,
      taller: 'TLR-001',
      placa: 'IJ7890',
      fecha: '2026-06-15',
      lineas: [{ codigo: 'REP-LD-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['SINIESTRO_CERRADO'] },
  },
  {
    id: 'SINIESTRO-01',
    nota: 'Número de siniestro que no existe.',
    factura: {
      numero: 'FAC-3007',
      siniestro: 'SIN-2026-9999',
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['SINIESTRO_INEXISTENTE'] },
  },
  {
    id: 'TECHO-01',
    nota: 'Granizo: panel de techo y parabrisas son coherentes; el radiador no.',
    factura: {
      numero: 'FAC-2019',
      siniestro: S4,
      taller: 'TLR-004',
      placa: 'GH3456',
      fecha: '2026-08-15',
      lineas: [
        { codigo: 'REP-C-02', cantidad: 1 }, // techo, coherente
        { codigo: 'REP-C-01', cantidad: 1 }, // parabrisas, coherente
        { codigo: 'MO-CRI-01', cantidad: 2 },
        { codigo: 'REP-M-02', cantidad: 1 }, // mecánica, NO está entre las zonas dañadas
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['ZONA_INCOHERENTE'],
      objetadoLineas: 21000,
    },
  },
  {
    id: 'LIMPIA-09',
    nota: '0.29 litros a B/.46.50 son B/.13.485. El centavo correcto es 13.49, y 0.29*100 en coma flotante da 28.999999999999996.',
    factura: {
      numero: 'FAC-1009',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-23',
      lineas: [
        { codigo: 'MO-PIN-01', cantidad: 5 },
        { codigo: 'MAT-BAS-02', cantidad: 0.29, importe: 13.49 },
      ],
    },
    espera: {
      estado: 'CONFORME',
      motivos: [],
      objetadoLineas: 0,
      prohibidos: ['ARITMETICA_LINEA', 'TOPE_MATERIALES'],
    },
  },
  {
    id: 'DOBLE-CIERRE-01',
    nota: 'Una línea con dos razones para cerrarse: código inexistente y repetido. La plata se objeta una sola vez.',
    factura: {
      numero: 'FAC-2020',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-08-03',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-X-77', descripcion: 'Ajuste estructural', cantidad: 1, precio: 90.0 },
        { codigo: 'REP-X-77', descripcion: 'Ajuste estructural', cantidad: 1, precio: 90.0 },
      ],
    },
    espera: {
      estado: 'OBJETADA_PARCIAL',
      motivos: ['FUERA_DE_TARIFARIO', 'DUPLICADO_EN_FACTURA'],
      objetadoLineas: 18000,
    },
  },
  // --------------------------------------------- regresiones de errores reales
  // Tres fallos que una revisión externa encontró y el guantelete no. Quedan
  // aquí para que no vuelvan.
  {
    id: 'REGRESION-TOTAL-01',
    nota: 'Factura limpia con el total pisado a B/.1.00. Antes daba CONFORME con un importe a pagar de B/.740.44, mayor que lo cobrado.',
    factura: {
      numero: 'FAC-4001',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-PIN-01', cantidad: 5 },
      ],
      total: 1.0,
    },
    espera: { estado: 'PENDIENTE', motivos: ['TOTAL_INCOHERENTE'], objetadoLineas: 0 },
  },
  {
    id: 'REGRESION-TOTAL-02',
    nota: 'El mismo caso con el total inflado en B/.1.00: tampoco concilia.',
    factura: {
      numero: 'FAC-4002',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
      ],
      total: 570.25,
    },
    espera: { estado: 'PENDIENTE', motivos: ['TOTAL_INCOHERENTE'] },
  },
  {
    id: 'REGRESION-DESCUENTO-01',
    nota: 'Precio unitario declarado de B/.500 sobre tarifa de B/.420, pero el importe cobrado ya es B/.420. Antes se reconocían B/.340: se descontaba dos veces la misma diferencia.',
    factura: {
      numero: 'FAC-4003',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1, precio: 500.0, importe: 420.0 }],
    },
    espera: { estado: 'CONFORME', motivos: ['SOBREPRECIO'], objetadoLineas: 0 },
  },
  {
    id: 'REGRESION-DESCUENTO-02',
    nota: 'Horas por encima del estándar pero con el importe ya ajustado al tiempo reconocido: tampoco se descuenta.',
    factura: {
      numero: 'FAC-4004',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [{ codigo: 'MO-DES-01', cantidad: 6, importe: 112.0 }],
    },
    espera: { estado: 'CONFORME', motivos: ['HORAS_EXCEDIDAS'], objetadoLineas: 0 },
  },
  {
    id: 'REGRESION-CITA-01',
    nota: 'Una línea sin texto original: la cita es reconstruida por el motor y eso no prueba nada. No puede aprobarse sola.',
    factura: {
      numero: 'FAC-4005',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1, sinTexto: true }],
    },
    espera: { estado: 'PENDIENTE', motivos: [], objetadoLineas: 0 },
  },
  {
    id: 'REGRESION-DUP-SOBREPRECIO-01',
    nota: 'Dos líneas con el mismo código pero precio distinto (420 y 500). No es un duplicado cierto: es ambiguo, y ahora se deriva a revisión en vez de que el motor decida solo cuál de las dos es la de más.',
    factura: {
      numero: 'FAC-4006',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-F-01', cantidad: 1, precio: 500.0 },
      ],
    },
    espera: {
      estado: 'PENDIENTE',
      motivos: ['POSIBLE_DUPLICADO', 'SOBREPRECIO'],
    },
  },
  {
    id: 'DUP-CIERTO-PRECIO-IGUAL',
    nota: 'Dos líneas con el mismo código, la misma cantidad y el mismo precio: esto sí es un duplicado cierto, y se sigue cerrando solo, sin esperar a una persona.',
    factura: {
      numero: 'FAC-4015',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'REP-F-02', cantidad: 1 },
        { codigo: 'REP-F-02', cantidad: 1 },
      ],
    },
    // 50% de la factura queda objetado: supera el umbral de derivación, así
    // que aunque el hallazgo sea cierto, decide un perito, no el agente solo.
    espera: { estado: 'DERIVADA', motivos: ['DUPLICADO_EN_FACTURA'], objetadoLineas: 31000 },
  },
  {
    id: 'DUP-MANO-OBRA-IDENTICA',
    nota: 'Dos líneas de mano de obra genérica ("desabolladura de panel") con exactamente la misma cantidad y el mismo precio. A diferencia de un repuesto, aquí no hay código de posición: puede ser el mismo panel cobrado dos veces, o dos paneles distintos con el mismo tiempo estándar. El motor no lo decide solo.',
    factura: {
      numero: 'FAC-4017',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-DES-01', cantidad: 4 },
      ],
    },
    espera: { estado: 'PENDIENTE', motivos: ['POSIBLE_DUPLICADO'] },
  },
  {
    id: 'DUP-AMBIGUO-CANTIDAD',
    nota: 'Mismo código, mismo precio, cantidad distinta (1 y 2). También ambiguo: podrían ser refacciones separadas registradas por error con el mismo código.',
    factura: {
      numero: 'FAC-4016',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'MO-DIA-01', cantidad: 1 },
        { codigo: 'MO-DIA-01', cantidad: 2 },
      ],
    },
    espera: { estado: 'PENDIENTE', motivos: ['POSIBLE_DUPLICADO'] },
  },
  {
    id: 'REGRESION-REVISION-01',
    nota: 'Material sin texto original al que además se le aplica el tope. Antes el ajuste de dinero borraba la marca de evidencia faltante.',
    factura: {
      numero: 'FAC-4007',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        { codigo: 'MO-PIN-01', cantidad: 5 },
        { codigo: 'MAT-BAS-01', cantidad: 4, sinTexto: true },
      ],
    },
    espera: { estado: 'PENDIENTE', motivos: ['TOPE_MATERIALES'] },
  },
  {
    id: 'REGRESION-VALIDACION-01',
    nota: 'Cantidad negativa. Antes daba CONFORME con un importe reconocido negativo.',
    factura: {
      numero: 'FAC-4008',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [{ codigo: 'REP-F-01', cantidad: -1, importe: 420.0 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-VALIDACION-02',
    nota: 'Factura sin líneas. Antes daba CONFORME: no hay nada que auditar.',
    factura: {
      numero: 'FAC-4009',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [],
    },
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-VALIDACION-03',
    nota: 'Fecha que no existe en el calendario.',
    // 99-99 no es parseable; 02-31 sí lo es y se desborda a marzo. Hay una
    // trampa por cada uno de los dos caminos.
    factura: {
      numero: 'FAC-4010',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-99-99',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-VALIDACION-04',
    nota: '31 de febrero: el calendario lo desborda a marzo en vez de rechazarlo. Es el otro camino de la validación de fechas.',
    factura: {
      numero: 'FAC-4011',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-02-31',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-NULO-01',
    nota: 'Entrada null. Antes reventaba con una excepción al leer f.numero antes de validar.',
    factura: null as unknown as EspecFactura,
    crudo: true,
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-NULO-02',
    nota: 'Entrada undefined. Mismo problema, otra forma de llegar vacío.',
    factura: undefined as unknown as EspecFactura,
    crudo: true,
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-EVIDENCIA-01',
    nota: 'textoOriginal no es un texto, es un objeto. Antes se aceptaba como si fuera del documento y daba CONFORME. Entra crudo porque el constructor siempre arma su propio textoOriginal.',
    crudo: true,
    factura: {
      numero: 'FAC-4012',
      taller: 'TLR-001',
      siniestro: S1,
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [
        {
          codigo: 'REP-F-01',
          descripcion: 'Parachoques delantero',
          cantidad: 1,
          precioUnitario: 42000,
          importe: 42000,
          textoOriginal: { foo: 'bar' } as unknown as string,
        },
      ],
      subtotalDeclarado: 42000,
      itbmsDeclarado: 2940,
      totalDeclarado: 44940,
    } as unknown as EspecFactura,
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-EVIDENCIA-02',
    nota: 'Calidad inventada que no es original, alterno ni usado.',
    factura: {
      numero: 'FAC-4013',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      // @ts-expect-error — se prueba a propósito un valor fuera del catálogo.
      lineas: [{ codigo: 'REP-F-04', cantidad: 1, calidad: 'diamante' }],
    },
    espera: { estado: 'INVALIDA', motivos: ['DATOS_INVALIDOS'] },
  },
  {
    id: 'REGRESION-CONCILIA-01',
    nota: 'Documento que no concilia consigo mismo pero cuya única línea es correcta: nada que objetar, solo algo que conciliar. Antes el tablero mostraba 100% objetado sin un solo hallazgo de dinero.',
    factura: {
      numero: 'FAC-4014',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-20',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
      subtotal: 1.0,
      itbms: 0.07,
      total: 1.07,
    },
    espera: { estado: 'PENDIENTE', motivos: ['ARITMETICA_TOTAL'], objetadoLineas: 0 },
  },
  {
    id: 'CIERRE-CON-SOBREPRECIO-01',
    nota: 'Una línea con zona incoherente Y sobreprecio a la vez. El cierre por zona se lleva todo el monto; el sobreprecio queda como explicación adicional en cero, para no contar el mismo dinero dos veces.',
    factura: {
      numero: 'FAC-2021',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-08-04',
      lineas: [{ codigo: 'REP-T-02', cantidad: 1, precio: 300.0 }],
    },
    // Única línea, objetada por completo: nada queda reconocido, de ahí RECHAZADA.
    espera: {
      estado: 'RECHAZADA',
      motivos: ['ZONA_INCOHERENTE', 'SOBREPRECIO'],
      objetadoLineas: 30000,
    },
  },
  // ------------------------------------------------ refuerzo de reglas frágiles
  // Cada regla de abajo estaba sostenida por una sola trampa. Una regla con
  // una única prueba queda sin vigilancia en cuanto esa prueba cambia de
  // expectativa por otro motivo. Estas atacan la misma regla desde un ángulo
  // distinto al de la trampa original.
  {
    id: 'CALIDAD-02',
    nota: 'Repuesto usado donde la póliza pacta original. La primera trampa de calidad probaba original-contra-alterno; esta prueba el otro sentido.',
    factura: {
      numero: 'FAC-5001',
      siniestro: S3,
      taller: 'TLR-003',
      placa: 'EF9012',
      fecha: '2026-08-05',
      lineas: [{ codigo: 'REP-LI-01', cantidad: 1, calidad: 'usado' }],
    },
    espera: { estado: 'PENDIENTE', motivos: ['CALIDAD_NO_PACTADA'], objetadoLineas: 0 },
  },
  {
    id: 'DUP-PREV-02',
    nota: 'Duplicado contra factura anterior en un siniestro distinto al de la primera trampa, y combinado con una línea legítima que no debe verse afectada.',
    factura: {
      numero: 'FAC-5002',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-29',
      lineas: [
        { codigo: 'MO-PIN-01', cantidad: 5 },
        { codigo: 'REP-F-05', cantidad: 1 },
      ],
    },
    // B/.145.00 objetados sobre B/.305.00 de líneas es 47%: por encima del
    // umbral, así que decide un perito aunque el hallazgo sea cierto.
    espera: {
      estado: 'DERIVADA',
      motivos: ['DUPLICADO_ENTRE_FACTURAS'],
      objetadoLineas: 14500,
    },
  },
  {
    id: 'SINIESTRO-02',
    nota: 'Siniestro con formato plausible pero inexistente. La primera usaba 9999; esta usa un número que parece real.',
    factura: {
      numero: 'FAC-5003',
      siniestro: 'SIN-2026-0142',
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['SINIESTRO_INEXISTENTE'] },
  },
  {
    id: 'PLACA-02',
    nota: 'Placa que difiere en un solo carácter de la del expediente. El error de un dígito es más común que una placa completamente distinta.',
    factura: {
      numero: 'FAC-5004',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1235',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['PLACA_NO_COINCIDE'] },
  },
  {
    id: 'PLACA-03',
    nota: 'Misma placa pero en minúsculas. NO debe objetarse: la comparación ignora mayúsculas a propósito.',
    factura: {
      numero: 'FAC-5005',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'ab1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'CONFORME', motivos: [], prohibidos: ['PLACA_NO_COINCIDE'] },
  },
  {
    id: 'FECHA-03',
    nota: 'Factura un día ANTES del inicio de vigencia. La primera trampa probaba una fecha posterior al fin.',
    factura: {
      numero: 'FAC-5006',
      siniestro: S2,
      taller: 'TLR-002',
      placa: 'CD5678',
      fecha: '2025-11-14',
      lineas: [{ codigo: 'REP-T-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['FUERA_DE_VIGENCIA'] },
  },
  {
    id: 'FECHA-04',
    nota: 'Factura exactamente en el último día de vigencia. Borde: NO debe objetarse.',
    factura: {
      numero: 'FAC-5007',
      siniestro: S2,
      taller: 'TLR-002',
      placa: 'CD5678',
      fecha: '2026-11-14',
      lineas: [{ codigo: 'REP-T-01', cantidad: 1 }],
    },
    espera: { estado: 'CONFORME', motivos: [], prohibidos: ['FUERA_DE_VIGENCIA'] },
  },
  {
    id: 'FECHA-05',
    nota: 'Factura exactamente el mismo día del siniestro. Borde: NO es anterior, no debe objetarse.',
    factura: {
      numero: 'FAC-5008',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-14',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'CONFORME', motivos: [], prohibidos: ['FACTURA_ANTERIOR_AL_SINIESTRO'] },
  },
  {
    id: 'FECHA-06',
    nota: 'Factura un día antes del siniestro. Borde del otro lado: sí debe objetarse.',
    factura: {
      numero: 'FAC-5009',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-13',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
    },
    espera: { estado: 'INVALIDA', motivos: ['FACTURA_ANTERIOR_AL_SINIESTRO'] },
  },
  {
    id: 'CERRADO-02',
    nota: 'Siniestro cerrado con una factura que además tendría otros hallazgos. El cierre manda: se rechaza en la puerta sin auditar líneas.',
    factura: {
      numero: 'FAC-5010',
      siniestro: S5,
      taller: 'TLR-001',
      placa: 'IJ7890',
      fecha: '2026-06-20',
      lineas: [
        { codigo: 'REP-LD-01', cantidad: 1, precio: 900.0 },
        { codigo: 'REP-LD-01', cantidad: 1, precio: 900.0 },
      ],
    },
    espera: { estado: 'INVALIDA', motivos: ['SINIESTRO_CERRADO'] },
  },
  {
    id: 'ITBMS-02',
    nota: 'ITBMS declarado en cero. Un impuesto ausente es tan incorrecto como uno mal calculado.',
    factura: {
      numero: 'FAC-5011',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-30',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
      itbms: 0,
    },
    espera: { estado: 'PENDIENTE', motivos: ['ITBMS_INCORRECTO'], objetadoLineas: 0 },
  },
  {
    id: 'ITBMS-03',
    nota: 'ITBMS con un centavo de diferencia por redondeo hacia abajo. El motor no perdona el centavo, pero tampoco lo inventa.',
    factura: {
      numero: 'FAC-5012',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-30',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1 }],
      itbms: 29.39,
    },
    espera: { estado: 'PENDIENTE', motivos: ['ITBMS_INCORRECTO'], objetadoLineas: 0 },
  },
  {
    id: 'SUMA-02',
    nota: 'Reparación que agota la suma asegurada exactamente, sin pasarse. Borde: NO debe objetarse por ese motivo.',
    factura: {
      numero: 'FAC-5013',
      siniestro: S6,
      taller: 'TLR-002',
      placa: 'KL2468',
      fecha: '2026-08-26',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-LD-01', cantidad: 1 },
        { codigo: 'REP-M-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-ARM-01', cantidad: 3 },
      ],
    },
    espera: { estado: 'CONFORME', motivos: [], prohibidos: ['EXCEDE_SUMA_ASEGURADA'] },
  },
  // ------------------------------------------------------ bordes numéricos
  // Un motor de dinero falla en los bordes, no en el medio. Cada par de
  // abajo prueba el lado permitido y el lado objetable de un mismo umbral.
  {
    id: 'SUMA-03',
    nota: 'Reparación que supera la suma asegurada disponible del siniestro. El otro lado del borde que prueba SUMA-02.',
    factura: {
      numero: 'FAC-5014',
      siniestro: S6,
      taller: 'TLR-002',
      placa: 'KL2468',
      fecha: '2026-08-26',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-LD-01', cantidad: 1 },
        { codigo: 'REP-M-01', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-ARM-01', cantidad: 3 },
        { codigo: 'REP-F-04', cantidad: 1 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['EXCEDE_SUMA_ASEGURADA'] },
  },
  {
    id: 'UMBRAL-BORDE-BAJO',
    nota: 'Objeción justo por debajo del 40%: se resuelve sola, sin derivar.',
    factura: {
      numero: 'FAC-5015',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [
        { codigo: 'REP-F-04', cantidad: 1 },
        { codigo: 'MO-PIN-01', cantidad: 5 },
        { codigo: 'REP-F-01', cantidad: 1, precio: 620.0 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['SOBREPRECIO'], objetadoLineas: 20000 },
  },
  {
    id: 'PRECIO-EXACTO',
    nota: 'Precio exactamente igual al tarifario. Borde inferior del sobreprecio: NO debe objetarse.',
    factura: {
      numero: 'FAC-5016',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1, precio: 420.0 }],
    },
    espera: { estado: 'CONFORME', motivos: [], prohibidos: ['SOBREPRECIO'], objetadoLineas: 0 },
  },
  {
    id: 'PRECIO-UN-CENTAVO',
    nota: 'Un solo centavo por encima del tarifario. El fraude de un centavo por línea, repetido mil veces, es dinero real.',
    factura: {
      numero: 'FAC-5017',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1, precio: 420.01 }],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['SOBREPRECIO'], objetadoLineas: 1 },
  },
  {
    id: 'PRECIO-POR-DEBAJO',
    nota: 'Taller que cobra por debajo del tarifario. No es un regalo sospechoso: se reconoce lo cobrado y no se objeta nada.',
    factura: {
      numero: 'FAC-5018',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [{ codigo: 'REP-F-01', cantidad: 1, precio: 300.0 }],
    },
    espera: { estado: 'CONFORME', motivos: [], prohibidos: ['SOBREPRECIO'], objetadoLineas: 0 },
  },
  {
    id: 'TOPE-MATERIALES-EXACTO',
    nota: 'Materiales exactamente en el 35% de la mano de obra. Borde: NO debe objetarse.',
    factura: {
      numero: 'FAC-5019',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-31',
      lineas: [
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-PIN-01', cantidad: 4 },
        { codigo: 'MAT-ABR-01', cantidad: 7 },
      ],
    },
    espera: { estado: 'CONFORME', motivos: [], prohibidos: ['TOPE_MATERIALES', 'SOBREPRECIO'] },
  },
  {
    id: 'SIN-MANO-DE-OBRA',
    nota: 'Materiales sin ninguna mano de obra que los sostenga. El tope del 35% sobre cero es cero: todo el material se objeta.',
    factura: {
      numero: 'FAC-5020',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-31',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MAT-BAS-01', cantidad: 1 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['TOPE_MATERIALES'] },
  },
  {
    id: 'CANTIDAD-DECIMAL-FINA',
    nota: 'Cantidad de 0.01 unidades. El mínimo que el validador acepta, y la aritmética debe seguir cuadrando al centavo.',
    factura: {
      numero: 'FAC-5021',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'MAT-BAS-01', cantidad: 0.01 },
      ],
    },
    espera: { estado: 'OBJETADA_PARCIAL', motivos: ['TOPE_MATERIALES'] },
  },
  {
    id: 'FACTURA-LARGA',
    nota: 'Una factura con muchas líneas legítimas. Prueba que nada se rompe ni se duplica por volumen.',
    factura: {
      numero: 'FAC-5022',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-F-02', cantidad: 1 },
        { codigo: 'REP-F-03', cantidad: 1 },
        { codigo: 'REP-F-04', cantidad: 1 },
        { codigo: 'REP-F-06', cantidad: 1 },
        { codigo: 'REP-F-07', cantidad: 1 },
        { codigo: 'REP-F-08', cantidad: 1 },
        { codigo: 'REP-F-09', cantidad: 1 },
        { codigo: 'MO-DES-01', cantidad: 4 },
        { codigo: 'MO-PIN-01', cantidad: 5 },
        { codigo: 'MO-ARM-01', cantidad: 3 },
      ],
    },
    espera: { estado: 'CONFORME', motivos: [], objetadoLineas: 0 },
  },
  {
    id: 'DUP-SIN-IDENTIDAD-UNICA',
    nota: 'Dos amortiguadores delanteros (REP-M-02) idénticos. Son DOS piezas reales, izquierda y derecha, que comparten código: el catálogo no marca ese código con identidad única, así que no puede declararse duplicado cierto.',
    factura: {
      numero: 'FAC-6001',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [
        { codigo: 'REP-F-01', cantidad: 1 },
        { codigo: 'REP-M-02', cantidad: 1 },
        { codigo: 'REP-M-02', cantidad: 1 },
      ],
    },
    espera: { estado: 'PENDIENTE', motivos: ['POSIBLE_DUPLICADO'], prohibidos: ['DUPLICADO_EN_FACTURA'] },
  },
  {
    id: 'DUP-CON-IDENTIDAD-UNICA',
    nota: 'Dos capós idénticos. Un vehículo tiene UN capó y el catálogo lo marca con identidad única: aquí sí es duplicado cierto y se cierra solo.',
    factura: {
      numero: 'FAC-6002',
      siniestro: S1,
      taller: 'TLR-001',
      placa: 'AB1234',
      fecha: '2026-07-25',
      lineas: [
        { codigo: 'REP-F-04', cantidad: 1 },
        { codigo: 'REP-F-04', cantidad: 1 },
      ],
    },
    espera: { estado: 'DERIVADA', motivos: ['DUPLICADO_EN_FACTURA'], objetadoLineas: 58000 },
  },
];
