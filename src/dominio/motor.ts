// Motor determinista de auditoría de facturación de siniestros.
//
// Regla de oro: el modelo de lenguaje NUNCA decide aquí. Este archivo no
// importa nada de red ni de IA. Recibe datos ya leídos y decide con reglas.
// Toda objeción sale con su cláusula y con la cita literal de la factura.

import type {
  Dictamen,
  EstadoDictamen,
  FacturaCruda,
  LineaAuditada,
  LineaCruda,
  Motivo,
  MotivoCodigo,
  PartidaTarifario,
  Siniestro,
  Taller,
} from './tipos.ts';
import { validarFactura, esTextoUtil } from './validacion.ts';
import {
  CLAUSULA_ITBMS,
  formato,
  importeEsperado,
  itbmsSobre,
  porcentaje,
} from './dinero.ts';

/** Tope de materiales de pintura como proporción de la mano de obra reconocida. */
export const TOPE_MATERIALES = 0.35;
export const CLAUSULA_TOPE_MATERIALES = 'T-7.3';

/** Cláusulas del convenio marco (no del tarifario de precios). */
export const CLAUSULAS = {
  siniestro: 'C-1.1',
  placa: 'C-1.2',
  vigencia: 'C-2.1',
  anterioridad: 'C-2.2',
  cierre: 'C-2.3',
  red: 'C-3.1',
  catalogo: 'T-1.0',
  precio: 'T-4.1',
  horas: 'T-5.2',
  zona: 'T-6.1',
  calidad: 'T-6.4',
  duplicado: 'C-8.2',
  aritmetica: 'C-9.2',
  suma: 'C-10.1',
} as const;

/** Umbrales a partir de los cuales el agente NO decide: deriva a un perito. */
export const UMBRAL_PORCENTAJE = 40;
export const UMBRAL_MONTO = 100_000; // B/. 1,000.00 en centavos

export interface Entorno {
  tarifario: Map<string, PartidaTarifario>;
  talleres: Map<string, Taller>;
  siniestros: Map<string, Siniestro>;
  /** Códigos ya facturados y reconocidos en facturas previas del mismo siniestro. */
  codigosPreviosPorSiniestro?: Map<string, Set<string>>;
}

interface Cita {
  texto: string;
  origen: 'documento' | 'reconstruida';
}

/**
 * La cita es el texto del documento, no un resumen nuestro. Cuando la línea no
 * trae `textoOriginal` el motor arma uno legible, pero lo marca como
 * reconstruido: eso NO prueba que la factura diga lo que ahí se lee, y la
 * línea queda pendiente de revisión.
 */
function cita(l: LineaCruda): Cita {
  if (l.textoOriginal) return { texto: l.textoOriginal, origen: 'documento' };
  const cod = l.codigo ? `${l.codigo} ` : '';
  return {
    texto: `${cod}${l.descripcion} | ${l.cantidad} x ${formato(l.precioUnitario)} = ${formato(l.importe)}`,
    origen: 'reconstruida',
  };
}

function motivo(
  codigo: MotivoCodigo,
  detalle: string,
  monto: number,
  clausula: string,
  c: Cita | string,
): Motivo {
  const cc: Cita = typeof c === 'string' ? { texto: c, origen: 'reconstruida' } : c;
  return { codigo, detalle, monto, clausula, cita: cc.texto, origenCita: cc.origen };
}

// ---------------------------------------------------------------------------
// Puertas de factura: la primera que falla cierra el caso.
// ---------------------------------------------------------------------------

function puertasDeFactura(
  f: FacturaCruda,
  env: Entorno,
): { motivo: Motivo; codigo: MotivoCodigo } | null {
  const citaCab = `Factura ${f.numero} · siniestro ${f.siniestro} · placa ${f.placa} · fecha ${f.fecha} · taller ${f.taller}`;

  const s = env.siniestros.get(f.siniestro);
  if (!s) {
    return {
      codigo: 'SINIESTRO_INEXISTENTE',
      motivo: motivo(
        'SINIESTRO_INEXISTENTE',
        `El siniestro ${f.siniestro} no existe en el expediente de la aseguradora.`,
        f.totalDeclarado,
        CLAUSULAS.siniestro,
        citaCab,
      ),
    };
  }

  if (s.placa.toUpperCase() !== f.placa.toUpperCase()) {
    return {
      codigo: 'PLACA_NO_COINCIDE',
      motivo: motivo(
        'PLACA_NO_COINCIDE',
        `La factura declara placa ${f.placa} y el siniestro ${s.numero} corresponde a ${s.placa}.`,
        f.totalDeclarado,
        CLAUSULAS.placa,
        citaCab,
      ),
    };
  }

  if (s.estado === 'cerrado') {
    return {
      codigo: 'SINIESTRO_CERRADO',
      motivo: motivo(
        'SINIESTRO_CERRADO',
        `El siniestro ${s.numero} está cerrado; no admite facturación adicional sin reapertura.`,
        f.totalDeclarado,
        CLAUSULAS.cierre,
        citaCab,
      ),
    };
  }

  if (f.fecha < s.vigenciaDesde || f.fecha > s.vigenciaHasta) {
    return {
      codigo: 'FUERA_DE_VIGENCIA',
      motivo: motivo(
        'FUERA_DE_VIGENCIA',
        `La factura tiene fecha ${f.fecha}, fuera de la vigencia de la póliza (${s.vigenciaDesde} a ${s.vigenciaHasta}).`,
        f.totalDeclarado,
        CLAUSULAS.vigencia,
        citaCab,
      ),
    };
  }

  if (f.fecha < s.fechaOcurrencia) {
    return {
      codigo: 'FACTURA_ANTERIOR_AL_SINIESTRO',
      motivo: motivo(
        'FACTURA_ANTERIOR_AL_SINIESTRO',
        `La factura tiene fecha ${f.fecha}, anterior a la ocurrencia del siniestro (${s.fechaOcurrencia}).`,
        f.totalDeclarado,
        CLAUSULAS.anterioridad,
        citaCab,
      ),
    };
  }

  const taller = env.talleres.get(f.taller);
  if (!taller || !taller.enRed || s.tallerAsignado !== f.taller) {
    const razon = !taller
      ? 'no figura en el convenio'
      : !taller.enRed
        ? 'no está en la red'
        : `no es el taller asignado (${s.tallerAsignado})`;
    return {
      codigo: 'TALLER_NO_AUTORIZADO',
      motivo: motivo(
        'TALLER_NO_AUTORIZADO',
        `El taller ${f.taller} ${razon}.`,
        f.totalDeclarado,
        CLAUSULAS.red,
        citaCab,
      ),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Auditoría de línea
// ---------------------------------------------------------------------------

function auditarLinea(
  l: LineaCruda,
  indice: number,
  s: Siniestro,
  env: Entorno,
  vistosEnFactura: Map<string, { veces: number; cantidad: number; precioUnitario: number }>,
  previos: Set<string>,
): LineaAuditada {
  const c = cita(l);
  const motivos: Motivo[] = [];
  const facturado = l.importe;

  let cierreTotal = false;
  let cierreYaContado = false;
  const montoDeCierre = (): number => {
    if (cierreYaContado) return 0;
    cierreYaContado = true;
    return facturado;
  };

  const partida = l.codigo ? env.tarifario.get(l.codigo) : undefined;

  // L1 — catálogo
  if (!partida) {
    cierreTotal = true;
    motivos.push(
      motivo(
        'FUERA_DE_TARIFARIO',
        l.codigo
          ? `El código ${l.codigo} no existe en el tarifario acordado.`
          : 'La línea no declara código de tarifario, por lo que no es verificable.',
        montoDeCierre(),
        CLAUSULAS.catalogo,
        c,
      ),
    );
  }

  // L2 — duplicado dentro de la misma factura / contra facturas anteriores.
  //
  // Un código repetido con la MISMA cantidad y el MISMO precio es casi
  // siempre el mismo trabajo facturado dos veces: cierre total, sin
  // discusión. Un código repetido con cantidad o precio DISTINTOS puede ser
  // dos piezas o dos operaciones legítimas que comparten código de tarifario
  // — eso el motor no lo puede decidir solo, así que lo deriva en vez de
  // aprobarlo o rechazarlo por su cuenta.
  let posibleDuplicado = false;
  if (l.codigo) {
    const previo = vistosEnFactura.get(l.codigo);
    const firma = { veces: (previo?.veces ?? 0) + 1, cantidad: l.cantidad, precioUnitario: l.precioUnitario };
    vistosEnFactura.set(l.codigo, firma);

    if (previo) {
      const idéntico = previo.cantidad === l.cantidad && previo.precioUnitario === l.precioUnitario;
      // Solo se declara duplicado cierto cuando el catálogo afirma que ese
      // código identifica una pieza única e inequívoca del vehículo. Antes
      // esto se deducía del tipo ("es un repuesto, luego su código lleva la
      // posición"), y era falso para nuestro propio catálogo: REP-M-02,
      // "Amortiguador delantero", son dos piezas —izquierda y derecha— con
      // el mismo código. Dos líneas idénticas ahí son legítimas.
      //
      // Sin partida (código inexistente) la línea ya queda 100% rechazada
      // por FUERA_DE_TARIFARIO, así que la distinción no cambia el dinero.
      const puedeSerCierto = !partida || partida.identidadUnica === true;
      if (idéntico && puedeSerCierto) {
        cierreTotal = true;
        motivos.push(
          motivo(
            'DUPLICADO_EN_FACTURA',
            `El código ${l.codigo} ya aparece en esta misma factura con la misma cantidad y el mismo precio (ocurrencia ${firma.veces}). Una cantidad mayor se declara en la columna de cantidad, no repitiendo la línea.`,
            montoDeCierre(),
            CLAUSULAS.duplicado,
            c,
          ),
        );
      } else {
        posibleDuplicado = true;
        motivos.push(
          motivo(
            'POSIBLE_DUPLICADO',
            `El código ${l.codigo} aparece más de una vez en la factura con cantidad o precio distintos (antes: ${previo.cantidad} × ${formato(previo.precioUnitario)}; ahora: ${l.cantidad} × ${formato(l.precioUnitario)}). Puede ser dos piezas u operaciones legítimas con el mismo código, o un intento de cobro doble disfrazado. Requiere que una persona confirme cuál es.`,
            0,
            CLAUSULAS.duplicado,
            c,
          ),
        );
      }
    } else if (previos.has(l.codigo)) {
      cierreTotal = true;
      motivos.push(
        motivo(
          'DUPLICADO_ENTRE_FACTURAS',
          `El código ${l.codigo} ya fue reconocido en una factura anterior del siniestro ${s.numero}.`,
          montoDeCierre(),
          CLAUSULAS.duplicado,
          c,
        ),
      );
    }
  }

  // L3 — coherencia con el daño reportado
  if (partida) {
    const general = partida.zonas.includes('general');
    const coincide = partida.zonas.some((z) => s.zonasDanadas.includes(z));
    if (!general && !coincide) {
      cierreTotal = true;
      motivos.push(
        motivo(
          'ZONA_INCOHERENTE',
          `La partida pertenece a ${partida.zonas.join(', ')} y el siniestro reporta daño en ${s.zonasDanadas.join(', ')} (impacto ${s.tipoImpacto}).`,
          montoDeCierre(),
          CLAUSULAS.zona,
          c,
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Dinero. Una sola base y un solo reparto.
  //
  // El importe que el tarifario sostiene se calcula UNA vez, con la cantidad
  // reconocible y el precio reconocible. Lo objetado es la diferencia contra
  // lo que la línea efectivamente cobró — nunca la suma de tres cálculos que
  // se pisan entre sí. Si el taller declara un precio unitario alto pero
  // cobra el importe correcto, no hay nada que descontar.
  // -------------------------------------------------------------------------
  let objetadoParcial = 0;
  const razonesRevision: string[] = [];
  if (posibleDuplicado) {
    razonesRevision.push(
      `El código ${l.codigo} se repite con datos distintos: hace falta confirmar si son piezas separadas o un cobro doble.`,
    );
  }
  if (c.origen === 'reconstruida') {
    razonesRevision.push(
      'La cita de esta línea la reconstruyó el motor con los campos: no hay fragmento del documento que la respalde.',
    );
  }

  if (partida) {
    const horasEstandar = partida.tipo === 'mano_obra' ? partida.horasEstandar : undefined;
    const cantidadReconocible =
      horasEstandar !== undefined ? Math.min(l.cantidad, horasEstandar) : l.cantidad;
    const precioReconocible = Math.min(l.precioUnitario, partida.precioAcordado);
    const importeTarifario = importeEsperado(cantidadReconocible, precioReconocible);

    objetadoParcial = Math.max(0, facturado - importeTarifario);
    // Si la línea ya se cerró entera, su monto lo lleva el motivo del cierre.
    // Los demás explican, pero no reparten un centavo más: de lo contrario las
    // razones suman más que lo objetado y la trazabilidad deja de servir.
    let porRepartir = cierreTotal ? 0 : objetadoParcial;
    const toma = (v: number) => {
      const t = Math.max(0, Math.min(v, porRepartir));
      porRepartir -= t;
      return t;
    };

    // Las explicaciones se reparten el monto en orden, sin excederlo nunca.
    if (horasEstandar !== undefined && l.cantidad > horasEstandar) {
      const horasExceso = Math.round((l.cantidad - horasEstandar) * 100) / 100;
      motivos.push(
        motivo(
          'HORAS_EXCEDIDAS',
          `Factura ${l.cantidad} h y el tiempo estándar reconocido es ${horasEstandar} h (exceso ${horasExceso} h).`,
          toma(importeEsperado(horasExceso, precioReconocible)),
          CLAUSULAS.horas,
          c,
        ),
      );
    }

    if (l.precioUnitario > partida.precioAcordado) {
      motivos.push(
        motivo(
          'SOBREPRECIO',
          `Declara ${formato(l.precioUnitario)} por unidad; el tarifario acordado fija ${formato(partida.precioAcordado)}.`,
          toma(importeEsperado(cantidadReconocible, l.precioUnitario - partida.precioAcordado)),
          partida.clausula,
          c,
        ),
      );
    }

    // L4 — calidad de repuesto distinta a la pactada: no es plata, es un
    // permiso que falta. No puede terminar en CONFORME.
    if (
      partida.tipo === 'repuesto' &&
      l.calidad &&
      s.politicaRepuestos !== 'indistinto' &&
      l.calidad !== s.politicaRepuestos
    ) {
      razonesRevision.push(
        `Repuesto ${l.calidad} con póliza que pacta ${s.politicaRepuestos}: requiere autorización escrita.`,
      );
      motivos.push(
        motivo(
          'CALIDAD_NO_PACTADA',
          `Declara repuesto ${l.calidad} y la póliza del siniestro pacta ${s.politicaRepuestos}. Requiere autorización escrita antes de reconocer la partida.`,
          0,
          CLAUSULAS.calidad,
          c,
        ),
      );
    }

    // L5 — aritmética de la línea, sobre el resto que nadie explicó todavía.
    const aritmetico = importeEsperado(l.cantidad, l.precioUnitario);
    if (aritmetico !== facturado) {
      const sentido =
        facturado > aritmetico
          ? `El importe declarado es ${formato(facturado)} y ${l.cantidad} x ${formato(l.precioUnitario)} da ${formato(aritmetico)}.`
          : `El importe declarado es ${formato(facturado)}, menor que ${formato(aritmetico)}. Se reconoce lo declarado y no se descuenta nada por este concepto.`;
      motivos.push(
        motivo('ARITMETICA_LINEA', sentido, toma(porRepartir), CLAUSULAS.aritmetica, c),
      );
    }

    // Si algo quedó sin explicar, se dice en vez de esconderlo.
    if (porRepartir > 0) {
      motivos.push(
        motivo(
          'ARITMETICA_LINEA',
          `Diferencia de ${formato(porRepartir)} contra el importe que sostiene el tarifario (${formato(importeTarifario)}).`,
          toma(porRepartir),
          CLAUSULAS.aritmetica,
          c,
        ),
      );
    }
  }

  const montoObjetado = cierreTotal ? facturado : Math.min(objetadoParcial, facturado);
  const montoReconocido = facturado - montoObjetado;

  const requiereRevision = razonesRevision.length > 0;

  return {
    indice,
    cruda: l,
    estado: requiereRevision ? 'DERIVADA' : montoObjetado === 0 ? 'CONFORME' : 'OBJETADA',
    montoReconocido,
    montoObjetado,
    motivos,
    requiereRevision,
    razonesRevision,
    partida,
  };
}

// ---------------------------------------------------------------------------
// Dictamen
// ---------------------------------------------------------------------------

/**
 * Dudas sobre la LECTURA del documento, no sobre su contenido. Vienen de la
 * extracción con modelo: campos cuyo papel no se pudo probar. Entran aquí
 * porque un dictamen tiene que decir una sola cosa — si la lectura no está
 * confirmada, el resultado no puede presentarse como conforme, por mucho
 * que las cuentas cuadren.
 */
export function auditar(entrada: unknown, env: Entorno, dudasDeLectura: string[] = []): Dictamen {
  const t0 = performance.now();

  // Puerta cero: `entrada` es cualquier cosa que haya llegado de afuera — de
  // un modelo, de un formulario, de una integración. No se lee ni un campo
  // suyo antes de que la validación confirme que tiene la forma de una
  // factura. Un `null` o un `undefined` no revientan el motor: se devuelven
  // como no auditables.
  const problemas = validarFactura(entrada);
  if (problemas.length > 0) {
    return {
      factura: esTextoUtil((entrada as Partial<FacturaCruda> | null)?.numero)
        ? (entrada as FacturaCruda).numero
        : '(sin número)',
      siniestro: esTextoUtil((entrada as Partial<FacturaCruda> | null)?.siniestro)
        ? (entrada as FacturaCruda).siniestro
        : '(desconocido)',
      estado: 'INVALIDA',
      puertaQueCerro: 'DATOS_INVALIDOS',
      totalFacturado: 0,
      totalReconocido: 0,
      totalObjetado: 0,
      montoPorConciliar: 0,
      porcentajeObjetado: 0,
      itbmsRecalculado: 0,
      totalAPagar: 0,
      totalCalculado: 0,
      documentoConcilia: false,
      lineas: [],
      motivosFactura: [
        motivo(
          'DATOS_INVALIDOS',
          `El documento no es auditable: ${problemas.join(' ')}`,
          0,
          CLAUSULAS.aritmetica,
          'Entrada recibida por el motor',
        ),
      ],
      sumaLineas: 0,
      requiereRevision: true,
      razonesRevision: [...problemas, ...dudasDeLectura],
      ms: performance.now() - t0,
    };
  }

  // A partir de aquí `entrada` ya tiene la forma validada de una factura.
  const f = entrada as FacturaCruda;

  const base: Dictamen = {
    factura: f.numero,
    siniestro: f.siniestro,
    estado: 'CONFORME',
    totalFacturado: f.totalDeclarado,
    totalReconocido: 0,
    totalObjetado: 0,
    montoPorConciliar: 0,
    porcentajeObjetado: 0,
    itbmsRecalculado: 0,
    totalAPagar: 0,
    totalCalculado: 0,
    documentoConcilia: false,
    lineas: [],
    motivosFactura: [],
    sumaLineas: 0,
    requiereRevision: false,
    razonesRevision: [],
    ms: 0,
  };

  const puerta = puertasDeFactura(f, env);
  if (puerta) {
    return {
      ...base,
      estado: 'INVALIDA',
      puertaQueCerro: puerta.codigo,
      totalObjetado: f.totalDeclarado,
      porcentajeObjetado: 100,
      motivosFactura: [puerta.motivo],
      requiereRevision: true,
      razonesRevision: [puerta.motivo.detalle, ...dudasDeLectura],
      ms: performance.now() - t0,
    };
  }

  const s = env.siniestros.get(f.siniestro);
  if (!s) {
    // Inalcanzable si las puertas corrieron, pero el motor no revienta nunca:
    // una excepción no es un dictamen.
    return {
      ...base,
      estado: 'INVALIDA',
      puertaQueCerro: 'SINIESTRO_INEXISTENTE',
      totalObjetado: f.totalDeclarado,
      porcentajeObjetado: 100,
      requiereRevision: true,
      razonesRevision: ['El siniestro no existe en el expediente.', ...dudasDeLectura],
      ms: performance.now() - t0,
    };
  }
  const previos = env.codigosPreviosPorSiniestro?.get(f.siniestro) ?? new Set<string>();
  const vistos = new Map<string, { veces: number; cantidad: number; precioUnitario: number }>();

  const lineas = f.lineas.map((l, i) => auditarLinea(l, i, s, env, vistos, previos));
  const motivosFactura: Motivo[] = [];

  // Tope de materiales sobre la mano de obra reconocida.
  const manoObra = lineas
    .filter((la) => la.partida?.tipo === 'mano_obra')
    .reduce((a, la) => a + la.montoReconocido, 0);
  const materiales = lineas.filter((la) => la.partida?.tipo === 'material');
  const materialesReconocidos = materiales.reduce((a, la) => a + la.montoReconocido, 0);
  const tope = Math.round(manoObra * TOPE_MATERIALES);
  if (materialesReconocidos > tope) {
    let exceso = materialesReconocidos - tope;
    motivosFactura.push(
      motivo(
        'TOPE_MATERIALES',
        `Materiales de pintura por ${formato(materialesReconocidos)} contra mano de obra reconocida de ${formato(manoObra)}. El convenio los topa en ${TOPE_MATERIALES * 100}% (${formato(tope)}).`,
        exceso,
        CLAUSULA_TOPE_MATERIALES,
        `Materiales: ${materiales.map((m) => m.cruda.codigo ?? m.cruda.descripcion).join(', ')}`,
      ),
    );
    // Se descuenta el exceso de las líneas de material, de la más cara a la más barata.
    const ordenadas = [...materiales].sort((a, b) => b.montoReconocido - a.montoReconocido);
    for (const la of ordenadas) {
      if (exceso <= 0) break;
      const quita = Math.min(exceso, la.montoReconocido);
      la.montoReconocido -= quita;
      la.montoObjetado += quita;
      exceso -= quita;
    }
  }

  // -------------------------------------------------------------------------
  // Conciliación del documento consigo mismo.
  //
  // Los importes declarados por el taller se conservan tal cual. El motor
  // calcula los suyos aparte y compara: nunca sustituye la cifra de origen por
  // una que cuadre. Un documento que no cierra no se paga ni se rechaza; se
  // devuelve.
  // -------------------------------------------------------------------------
  const sumaLineas = f.lineas.reduce((a, l) => a + l.importe, 0);
  const totalCalculado = sumaLineas + itbmsSobre(sumaLineas);
  const itbmsEsperado = itbmsSobre(f.subtotalDeclarado);
  const razonesRevision: string[] = [];

  if (sumaLineas !== f.subtotalDeclarado) {
    razonesRevision.push('El subtotal declarado no es la suma de las líneas.');
    motivosFactura.push(
      motivo(
        'ARITMETICA_TOTAL',
        `El subtotal declarado es ${formato(f.subtotalDeclarado)} y la suma de las líneas da ${formato(sumaLineas)}.`,
        0,
        CLAUSULAS.aritmetica,
        `Subtotal declarado: ${formato(f.subtotalDeclarado)}`,
      ),
    );
  }
  if (f.itbmsDeclarado !== itbmsEsperado) {
    razonesRevision.push('El ITBMS declarado no es el 7% del subtotal declarado.');
    motivosFactura.push(
      motivo(
        'ITBMS_INCORRECTO',
        `Declara ITBMS de ${formato(f.itbmsDeclarado)} y el 7% sobre ${formato(f.subtotalDeclarado)} es ${formato(itbmsEsperado)}.`,
        0,
        CLAUSULA_ITBMS,
        `ITBMS declarado: ${formato(f.itbmsDeclarado)}`,
      ),
    );
  }
  if (f.totalDeclarado !== f.subtotalDeclarado + f.itbmsDeclarado) {
    razonesRevision.push('El total declarado no es el subtotal más el ITBMS declarados.');
    motivosFactura.push(
      motivo(
        'TOTAL_INCOHERENTE',
        `El total declarado es ${formato(f.totalDeclarado)} y el subtotal más el ITBMS declarados dan ${formato(f.subtotalDeclarado + f.itbmsDeclarado)}.`,
        0,
        CLAUSULAS.aritmetica,
        `Subtotal ${formato(f.subtotalDeclarado)} + ITBMS ${formato(f.itbmsDeclarado)}, total declarado ${formato(f.totalDeclarado)}`,
      ),
    );
  }
  const documentoConcilia = razonesRevision.length === 0;

  let totalReconocido = lineas.reduce((a, la) => a + la.montoReconocido, 0);

  if (totalReconocido > s.sumaAsegurada) {
    const exceso = totalReconocido - s.sumaAsegurada;
    motivosFactura.push(
      motivo(
        'EXCEDE_SUMA_ASEGURADA',
        `Lo reconocido (${formato(totalReconocido)}) supera la suma asegurada disponible del siniestro (${formato(s.sumaAsegurada)}).`,
        exceso,
        CLAUSULAS.suma,
        `Suma asegurada: ${formato(s.sumaAsegurada)}`,
      ),
    );
    totalReconocido = s.sumaAsegurada;
  }

  for (const la of lineas) razonesRevision.push(...la.razonesRevision);
  // Una lectura sin confirmar pesa igual que una autorización pendiente: el
  // dictamen no puede declararse conforme mientras exista.
  razonesRevision.push(...dudasDeLectura);

  const itbmsRecalculado = itbmsSobre(totalReconocido);
  // Si el documento no concilia, no hay importe reconocido todavía: primero
  // hay que corregirlo. Pero eso NO es lo mismo que "objetado": objetado es
  // dinero que el motor encontró mal, con una regla y una cláusula detrás.
  // Un documento que no concilia puede no tener ni un hallazgo de dinero, y
  // mostrarlo como "100% objetado" mezclaría dos cosas de significado
  // distinto para quien lee el tablero.
  const totalAPagar = documentoConcilia
    ? Math.min(totalReconocido + itbmsRecalculado, f.totalDeclarado)
    : 0;
  const totalObjetado = documentoConcilia
    ? Math.max(0, f.totalDeclarado - totalAPagar)
    : Math.max(0, sumaLineas - totalReconocido); // solo lo que las líneas objetan
  // Lo que resta no es ni pago ni hallazgo: es lo que depende de que el
  // documento concilie. Se nombra en vez de dejarlo como un hueco.
  const montoPorConciliar = Math.max(0, f.totalDeclarado - totalAPagar - totalObjetado);
  // Un porcentaje sobre un total que no conciliaba consigo mismo no describe
  // nada real: se ha visto salir por encima de 7000%. "No calculable" es la
  // respuesta honesta hasta que el documento se corrija.
  const pct = documentoConcilia ? porcentaje(totalObjetado, f.totalDeclarado) : null;

  let estado: EstadoDictamen;
  if (razonesRevision.length > 0) estado = 'PENDIENTE';
  else if (totalObjetado === 0) estado = 'CONFORME';
  else if (totalReconocido === 0) estado = 'RECHAZADA';
  else if ((pct !== null && pct >= UMBRAL_PORCENTAJE) || totalObjetado >= UMBRAL_MONTO) estado = 'DERIVADA';
  else estado = 'OBJETADA_PARCIAL';

  // DERIVADA también es trabajo para una persona: la bandera y el estado dicen
  // lo mismo siempre.
  if (estado === 'DERIVADA') {
    razonesRevision.push(
      `La objeción alcanza ${pct}% de la factura: por encima del umbral decide un perito.`,
    );
  }
  const requiereRevision = razonesRevision.length > 0;

  // El estado de cada línea se decide una sola vez y desde la línea misma,
  // después de todos los ajustes de dinero. Un barrido por el estado de la
  // factura escondía qué línea concretamente pedía una persona.
  for (const la of lineas) {
    la.estado = la.requiereRevision
      ? 'DERIVADA'
      : la.montoObjetado === 0
        ? 'CONFORME'
        : 'OBJETADA';
  }

  return {
    factura: f.numero,
    siniestro: f.siniestro,
    estado,
    // El total que declaró el taller, sin sustituir.
    totalFacturado: f.totalDeclarado,
    totalCalculado,
    documentoConcilia,
    totalReconocido,
    totalObjetado,
    montoPorConciliar,
    porcentajeObjetado: pct,
    itbmsRecalculado,
    totalAPagar,
    lineas,
    motivosFactura,
    sumaLineas,
    requiereRevision,
    razonesRevision,
    ms: performance.now() - t0,
  };
}
