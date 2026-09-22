// Extracción de facturas escritas en prosa libre, con un modelo de lenguaje.
//
// Corre en el servidor. La clave de API nunca sale de aquí: este archivo lo
// importa una ruta de API de Next.js (app/api/extraer/route.ts), y ese es el
// único lugar del proyecto donde la clave se usa. El navegador nunca la ve.
//
// La regla de todo el proyecto se sostiene aquí más que en ningún otro lado:
// EL MODELO LEE Y CITA, NUNCA DECIDE. Este archivo no calcula ni un centavo
// de objeción — solo convierte texto desordenado en los mismos campos que
// el motor determinista ya sabe auditar, y verifica que cada dato tenga un
// fragmento literal del texto original detrás. Si no lo tiene, la línea se
// descarta antes de llegar al motor.

import Anthropic from '@anthropic-ai/sdk';
import { validarFactura, esTextoUtil, esDocumentoUtil } from '../dominio/validacion.ts';
import type { FacturaCruda, LineaCruda, CalidadRepuesto } from '../dominio/tipos.ts';

const MODELO = 'claude-sonnet-4-5';
const LIMITE_CARACTERES_ENTRADA = 6000;
// Una factura de veinte líneas con sus citas cabe de sobra en 2000 tokens.
// Reservar 4000 hacía al modelo trabajar de más y la espera se sentía: más de
// diez segundos mirando "Leyendo…" es una eternidad frente a un jurado.
const MAX_TOKENS = 2000;

export interface ResultadoExtraccion {
  ok: boolean;
  factura?: FacturaCruda;
  /** Por qué falló, en un lenguaje que un perito puede leer sin traducir. */
  problemas: string[];
  /**
   * Lecturas aceptadas que necesitan confirmación humana. No impiden la
   * auditoría: la factura se audita igual y esto se muestra junto al
   * dictamen.
   */
  ambiguas: string[];
  /** Lo que el modelo devolvió, tal cual, para depurar sin volver a llamar la API. */
  crudo?: unknown;
  ms: number;
}

const HERRAMIENTA = {
  name: 'reportar_factura',
  description:
    'Reporta los campos de una factura de taller leída de un texto. Cada campo numérico o de texto debe venir acompañado del fragmento EXACTO del documento original del que se leyó. Si un dato no aparece literalmente en el texto, omite ese campo en vez de adivinarlo.',
  input_schema: {
    type: 'object' as const,
    properties: {
      numero: { type: 'string', description: 'Número de la factura, tal como aparece.' },
      numero_cita: { type: 'string', description: 'Fragmento literal del que sale el número de factura.' },
      siniestro: { type: 'string', description: 'Número de siniestro, tal como aparece.' },
      siniestro_cita: { type: 'string', description: 'Fragmento literal del que sale el número de siniestro.' },
      taller: { type: 'string', description: 'Código del taller, tal como aparece (ej. TLR-001).' },
      taller_cita: { type: 'string', description: 'Fragmento literal del que sale el código de taller.' },
      placa: { type: 'string', description: 'Placa del vehículo, tal como aparece.' },
      placa_cita: { type: 'string', description: 'Fragmento literal del que sale la placa.' },
      fecha: { type: 'string', description: 'Fecha de la factura en formato AAAA-MM-DD.' },
      fecha_cita: { type: 'string', description: 'Fragmento literal del que sale la fecha.' },
      subtotal: { type: 'number', description: 'Subtotal declarado, en balboas (ej. 420.00).' },
      subtotal_cita: { type: 'string', description: 'Fragmento literal del que sale el subtotal.' },
      itbms: { type: 'number', description: 'ITBMS declarado, en balboas.' },
      itbms_cita: { type: 'string', description: 'Fragmento literal del que sale el ITBMS.' },
      total: { type: 'number', description: 'Total declarado, en balboas.' },
      total_cita: { type: 'string', description: 'Fragmento literal del que sale el total.' },
      lineas: {
        type: 'array',
        description: 'Cada renglón de la factura.',
        items: {
          type: 'object',
          properties: {
            codigo: { type: 'string', description: 'Código de tarifario, si el texto lo trae (ej. REP-F-01).' },
            descripcion: { type: 'string', description: 'Descripción de la partida, tal como aparece.' },
            cantidad: { type: 'number', description: 'Cantidad u horas.' },
            precio_unitario: { type: 'number', description: 'Precio unitario en balboas.' },
            importe: { type: 'number', description: 'Importe de la línea en balboas.' },
            calidad: {
              type: 'string',
              enum: ['original', 'alterno', 'usado'],
              description: 'Solo si el texto lo dice explícitamente para un repuesto.',
            },
            cita: {
              type: 'string',
              description: 'Fragmento literal EXACTO del texto original del que sale esta línea completa. Obligatorio.',
            },
          },
          required: ['descripcion', 'cantidad', 'precio_unitario', 'importe', 'cita'],
        },
      },
    },
    required: ['numero', 'siniestro', 'taller', 'placa', 'fecha', 'subtotal', 'itbms', 'total', 'lineas'],
  },
};

function normaliza(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Comprueba que un fragmento de cita aparezca, de verdad, dentro del texto
 * que el usuario pegó. Esto por sí solo NO basta para confiar en un valor:
 * una cita real como "Factura" puede respaldar cualquier número si nadie
 * comprueba que el número esté DENTRO de esa cita. Ver `valorRespaldadoPor`.
 */
function citaPresenteEnDocumento(cita: unknown, textoOriginal: string): cita is string {
  if (!esTextoUtil(cita)) return false;
  return normaliza(textoOriginal).includes(normaliza(cita));
}

/**
 * Extrae los números que aparecen dentro de un fragmento de texto, en el
 * formato en que sale de una factura panameña (con o sin "B/.", con coma de
 * miles opcional). Devuelve los valores ya convertidos, para comparar contra
 * lo que el modelo dice haber leído.
 */
function numerosEn(texto: string): number[] {
  const encontrados = texto.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return encontrados
    .map((n) => Number(n.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

/**
 * Verifica que cada número de una línea esté respaldado por su ETIQUETA en
 * el texto, no por su posición.
 *
 * La pregunta que esta función responde es una sola: **¿el modelo leyó bien
 * lo que el documento dice?** NO responde si lo que el documento dice está
 * bien — eso es trabajo del motor, y confundir las dos cosas fue un error
 * grave: exigir aquí que cantidad × precio = importe impedía que una factura
 * con un error aritmético real llegara al motor que existe para detectarlo.
 *
 * Una factura que dice "2 unidades a B/.100, importe B/.250" está mal, y
 * justamente por eso tiene que llegar entera al motor, que la objetará por
 * ARITMETICA_LINEA con su monto y su cláusula.
 */
const ETIQUETAS = {
  cantidad: ['cantidad', 'cant', 'unidades', 'unid', 'horas', 'hrs', 'hs', 'qty'],
  precio: ['precio', 'p. unit', 'p.unit', 'unitario', 'c/u', 'valor unitario'],
  importe: ['importe', 'total', 'subtotal', 'monto'],
} as const;

/**
 * Busca los números que una etiqueta podría estar rotulando dentro de la
 * cita, mirando a AMBOS lados.
 *
 * Un texto como "2 unidades 100" es genuinamente ambiguo: puede leerse
 * "2 unidades" (el número va antes) o "unidades: 100" (va después). Elegir
 * una de las dos en silencio y rechazar la otra es peor que no decidir —
 * rechaza lecturas correctas sin explicar por qué. Cuando las dos
 * interpretaciones existen y no coinciden, este análisis devuelve
 * `ambiguo`, y quien lo llama pide confirmación en vez de fallar.
 */
/**
 * Exige que la cifra empiece de verdad: no puede venir pegada a una letra ni
 * a un guion. Sin esto, el "01" de un código como REP-F-01 se leía como si
 * fuera la cifra escrita justo después.
 */
const INICIO_DE_CIFRA = '(?<![\\w-])';

type Lectura =
  | { tipo: 'ninguna' }
  | { tipo: 'unica'; valor: number }
  | { tipo: 'ambiguo'; candidatos: number[] };

function porEtiquetas(cita: string): {
  cantidad: Lectura;
  precio: Lectura;
  importe: Lectura;
} {
  const c = normaliza(cita);
  // `(?<![\w-])` exige que el número empiece de verdad: sin esto, el "01" de
  // un código como REP-F-01 se leía como si fuera la cifra escrita después.
  const num = INICIO_DE_CIFRA + '(\\d[\\d,]*(?:\\.\\d+)?)';
  const aNumero = (t: string) => Number(t.replace(/,/g, ''));

  const buscarLado = (claves: readonly string[], lado: 'antes' | 'despues'): number[] => {
    const vistos = new Set<number>();
    for (const clave of claves) {
      const k = clave.replace(/\./g, '\\.');
      const re =
        lado === 'despues'
          ? new RegExp(`${k}\\s*:?\\s*(?:b\\/\\.)?\\s*${num}`)
          : new RegExp(`${num}\\s*${k}`);
      const m = re.exec(c);
      if (m) vistos.add(aNumero(m[1]));
    }
    return [...vistos];
  };

  const papeles = ['cantidad', 'precio', 'importe'] as const;
  const despues: Record<string, number[]> = {};
  for (const p of papeles) despues[p] = buscarLado(ETIQUETAS[p], 'despues');

  const lecturas = {} as Record<(typeof papeles)[number], Lectura>;
  for (const p of papeles) {
    // Un número pegado ANTES de esta etiqueta no cuenta si OTRA etiqueta ya
    // lo reclama como su propio valor. En "precio B/.420.00 importe B/.520.00"
    // el 420 precede a "importe" solo porque es el valor de "precio": leerlo
    // como candidato fabricaba una ambigüedad que el texto no tiene.
    const reclamadosPorOtros = new Set(
      papeles.filter((otro) => otro !== p).flatMap((otro) => despues[otro]),
    );
    const antes = buscarLado(ETIQUETAS[p], 'antes').filter((v) => !reclamadosPorOtros.has(v));

    const candidatos = [...new Set([...despues[p], ...antes])];
    lecturas[p] =
      candidatos.length === 0
        ? { tipo: 'ninguna' }
        : candidatos.length === 1
          ? { tipo: 'unica', valor: candidatos[0] }
          : { tipo: 'ambiguo', candidatos };
  }

  return lecturas;
}

/**
 * Comprueba que los tres números de una línea sean fieles al documento.
 *
 * La regla es estricta a propósito: **los tres campos —cantidad, precio e
 * importe— necesitan su propia etiqueta en el texto**. Encontrar una sola no
 * verifica las otras dos.
 *
 * Esto importa porque la ausencia de etiqueta no es evidencia favorable. En
 * "2 x 100 importe 200" solo está etiquetado el importe; si el modelo
 * reporta cantidad 100 y precio 2, ese intercambio no se puede descartar, y
 * darlo por bueno porque el importe coincide sería exactamente el error que
 * esta función existe para evitar.
 *
 * Cuando falta la etiqueta de algún campo, la lectura se acepta —los números
 * están en la cita— pero se marca como ambigua, nombrando qué campo
 * concretamente queda sin confirmar.
 */
function terciaFiel(
  cantidad: number,
  precio: number,
  importe: number,
  cita: string,
): { ok: true; ambigua: boolean; sinConfirmar: string[] } | { ok: false; razón: string } {
  const presentes = numerosEn(cita);
  const estáEnLaCita = (v: number) => presentes.some((c) => Math.abs(c - v) < 0.005);

  if (!estáEnLaCita(cantidad)) return { ok: false, razón: `la cantidad ${cantidad} no aparece en la cita` };
  if (!estáEnLaCita(precio)) return { ok: false, razón: `el precio ${precio} no aparece en la cita` };
  if (!estáEnLaCita(importe)) return { ok: false, razón: `el importe ${importe} no aparece en la cita` };

  const etiquetado = porEtiquetas(cita);

  // Tres desenlaces por campo, y la diferencia importa:
  //   'unica'   → el texto dice inequívocamente qué número es: si el modelo
  //               reporta otro, es una contradicción demostrable → rechazo.
  //   'ambiguo' → la etiqueta tiene números a los dos lados ("2 unidades 100")
  //               y las dos lecturas son defendibles → confirmación humana,
  //               nunca elegir una en silencio y rechazar la otra.
  //   'ninguna' → sin etiqueta no hay nada que verificar → confirmación.
  const sinConfirmar: string[] = [];

  for (const [papel, valor] of [
    ['cantidad', cantidad],
    ['precio', precio],
    ['importe', importe],
  ] as const) {
    const lectura = etiquetado[papel];
    if (lectura.tipo === 'unica') {
      if (Math.abs(lectura.valor - valor) >= 0.005) {
        return {
          ok: false,
          razón: `el texto etiqueta ${lectura.valor} como ${papel}, y el modelo reporta ${valor}`,
        };
      }
      continue; // verificado
    }
    if (lectura.tipo === 'ambiguo') {
      // Si el valor reportado no está siquiera entre los candidatos, es una
      // contradicción aunque el formato sea ambiguo.
      const plausible = lectura.candidatos.some((c) => Math.abs(c - valor) < 0.005);
      if (!plausible) {
        return {
          ok: false,
          razón: `junto a la etiqueta de ${papel} el texto tiene ${lectura.candidatos.join(' y ')}, y el modelo reporta ${valor}`,
        };
      }
      sinConfirmar.push(
        `${papel} (el texto admite ${lectura.candidatos.join(' o ')} y se leyó ${valor})`,
      );
      continue;
    }
    sinConfirmar.push(papel);
  }

  return { ok: true, ambigua: sinConfirmar.length > 0, sinConfirmar };
}

/**
 * Un valor de texto (número de factura, placa, código, taller) está
 * respaldado por su cita si el valor aparece, literalmente, dentro del
 * fragmento citado — no solo en algún otro lugar del documento.
 */
function textoRespaldadoPor(valor: string, cita: string): boolean {
  return normaliza(cita).includes(normaliza(valor));
}

/**
 * Una fecha puede venir normalizada a AAAA-MM-DD aunque el documento la
 * escriba de otra forma. Se acepta la normalización, pero se comprueba que
 * la cita contenga esa MISMA fecha en alguno de los formatos admitidos. Un
 * formato ambiguo no se adivina: si no coincide ninguno, se rechaza.
 */
function fechaRespaldadaPor(valorISO: string, cita: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valorISO);
  if (!m) return false;
  const [, a, mes, d] = m;
  const dd = String(Number(d));
  const mm = String(Number(mes));
  const variantes = [
    valorISO,
    `${d}/${mes}/${a}`,
    `${dd}/${mm}/${a}`,
    `${d}-${mes}-${a}`,
    `${dd}-${mm}-${a}`,
    `${d}.${mes}.${a}`,
    `${a}/${mes}/${d}`,
  ];
  const c = normaliza(cita);
  return variantes.some((v) => c.includes(normaliza(v)));
}

/**
 * Un valor numérico (importe, cantidad) está respaldado por su cita si ese
 * número, con una tolerancia de medio centavo por redondeo, aparece entre
 * los números que el fragmento citado realmente contiene. Así "Factura" no
 * puede respaldar un total de B/.999,999.00: el número no está ahí.
 */
function numeroRespaldadoPor(valor: number, cita: string): boolean {
  const candidatos = numerosEn(cita);
  return candidatos.some((c) => Math.abs(c - valor) < 0.005);
}

export interface LineaExtraida {
  codigo?: unknown;
  descripcion?: unknown;
  cantidad?: unknown;
  precio_unitario?: unknown;
  importe?: unknown;
  calidad?: unknown;
  cita?: unknown;
}

export interface FacturaExtraida {
  numero?: unknown;
  numero_cita?: unknown;
  siniestro?: unknown;
  siniestro_cita?: unknown;
  taller?: unknown;
  taller_cita?: unknown;
  placa?: unknown;
  placa_cita?: unknown;
  fecha?: unknown;
  fecha_cita?: unknown;
  subtotal?: unknown;
  subtotal_cita?: unknown;
  itbms?: unknown;
  itbms_cita?: unknown;
  total?: unknown;
  total_cita?: unknown;
  lineas?: unknown;
}

function centavosDesde(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

/**
 * Convierte lo que el modelo reportó en un FacturaCruda, exigiendo cita
 * verificada campo por campo. Un campo sin cita comprobable en el texto
 * original simplemente no se incluye — y si eso deja huecos, la validación
 * de `validarFactura` los atrapa después, con el mismo criterio que ya
 * protege al motor de cualquier otra fuente de datos.
 */
/**
 * Un campo de TEXTO pasa solo si: (1) la cita existe de verdad en el
 * documento, y (2) el propio valor aparece dentro de esa cita. La condición
 * 2 es la que faltaba: sin ella, cualquier cita real —"Factura", una línea
 * cualquiera— podía respaldar un número de póliza inventado.
 */
function campoTexto(valor: unknown, cita: unknown, nombre: string, textoOriginal: string, huecos: string[]): string | undefined {
  if (!citaPresenteEnDocumento(cita, textoOriginal)) {
    huecos.push(`El campo "${nombre}" no trae una cita verificable en el texto pegado: se omite.`);
    return undefined;
  }
  if (typeof valor !== 'string' || !textoRespaldadoPor(valor, cita)) {
    huecos.push(`El campo "${nombre}" (valor "${String(valor)}") no coincide con lo que dice su propia cita ("${cita}"): se omite.`);
    return undefined;
  }
  return valor;
}

/** La misma idea que `campoTexto`, para un valor numérico (dinero). */
function campoNumero(valor: unknown, cita: unknown, nombre: string, textoOriginal: string, huecos: string[]): number | undefined {
  if (!citaPresenteEnDocumento(cita, textoOriginal)) {
    huecos.push(`El campo "${nombre}" no trae una cita verificable en el texto pegado: se omite.`);
    return undefined;
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor) || !numeroRespaldadoPor(valor, cita)) {
    huecos.push(`El campo "${nombre}" (valor "${String(valor)}") no aparece dentro de su propia cita ("${cita}"): se omite.`);
    return undefined;
  }
  return valor;
}

/** Exportado solo para pruebas: construye la factura sin llamar a Anthropic. */
export function aFacturaCruda(
  entrada: unknown,
  textoOriginal: string,
): { factura: unknown; huecos: string[]; ambiguas: string[] } {
  const huecos: string[] = [];
  // Distinto de `huecos`: esto NO impide auditar. Son lecturas que se
  // aceptan pero que una persona debe confirmar, porque el documento no
  // trae etiquetas que prueben qué número es cuál.
  const ambiguas: string[] = [];
  // El modelo puede devolver cualquier cosa, incluido null: se trata como una
  // respuesta vacía, nunca como una razón para reventar.
  const e = (typeof entrada === 'object' && entrada !== null ? entrada : {}) as FacturaExtraida;

  const numero = campoTexto(e.numero, e.numero_cita, 'número de factura', textoOriginal, huecos);
  const siniestro = campoTexto(e.siniestro, e.siniestro_cita, 'siniestro', textoOriginal, huecos);
  const taller = campoTexto(e.taller, e.taller_cita, 'taller', textoOriginal, huecos);
  const placa = campoTexto(e.placa, e.placa_cita, 'placa', textoOriginal, huecos);
  // La fecha es el único campo que admite normalización: la herramienta le
  // pide al modelo AAAA-MM-DD, pero el documento puede decir 20/07/2026.
  // Se comprueba equivalencia contra formatos admitidos explícitamente; un
  // formato que no esté en la lista se rechaza en vez de adivinarse.
  let fecha: string | undefined;
  if (!citaPresenteEnDocumento(e.fecha_cita, textoOriginal)) {
    huecos.push('El campo "fecha" no trae una cita verificable en el texto pegado: se omite.');
  } else if (typeof e.fecha !== 'string' || !fechaRespaldadaPor(e.fecha, e.fecha_cita)) {
    huecos.push(
      `El campo "fecha" (valor "${String(e.fecha)}") no coincide con ningún formato reconocible dentro de su propia cita ("${e.fecha_cita}"): se omite.`,
    );
  } else {
    fecha = e.fecha;
  }
  const subtotalB = campoNumero(e.subtotal, e.subtotal_cita, 'subtotal', textoOriginal, huecos);
  const itbmsB = campoNumero(e.itbms, e.itbms_cita, 'ITBMS', textoOriginal, huecos);
  const totalB = campoNumero(e.total, e.total_cita, 'total', textoOriginal, huecos);

  const lineasCrudas = Array.isArray(e.lineas) ? e.lineas : [];
  const lineas: unknown[] = lineasCrudas.map((lc: unknown, i: number) => {
    // Cada elemento se valida como objeto ANTES de leerle una propiedad. Un
    // `null` dentro del arreglo no puede reventar la conversión: la función
    // promete no lanzar nunca.
    if (typeof lc !== 'object' || lc === null || Array.isArray(lc)) {
      huecos.push(`Línea ${i + 1}: la respuesta no trae un objeto de línea. Se descarta.`);
      return null;
    }
    const l = lc as LineaExtraida;

    if (!citaPresenteEnDocumento(l.cita, textoOriginal)) {
      huecos.push(`Línea ${i + 1}: sin una cita verificable en el texto pegado. Se descarta.`);
      return null;
    }
    if (typeof l.cantidad !== 'number' || typeof l.precio_unitario !== 'number' || typeof l.importe !== 'number') {
      huecos.push(`Línea ${i + 1}: cantidad, precio o importe no son números. Se descarta.`);
      return null;
    }
    // Los tres números se verifican contra las ETIQUETAS del texto, no
    // contra su posición ni contra su aritmética. Aquí solo se pregunta si
    // la lectura fue fiel; si los números están mal entre sí, eso lo objeta
    // el motor con su regla ARITMETICA_LINEA, que existe exactamente para
    // eso y sabe cuantificarlo.
    const tercia = terciaFiel(l.cantidad, l.precio_unitario, l.importe, l.cita);
    if (!tercia.ok) {
      huecos.push(`Línea ${i + 1}: ${tercia.razón} (cita: "${l.cita}"). Se descarta.`);
      return null;
    }
    if (tercia.ambigua) {
      const faltantes = tercia.sinConfirmar.join(', ');
      ambiguas.push(
        `Línea ${i + 1} (${l.descripcion}): el documento no etiqueta ${faltantes}, así que no hay cómo probar qué número corresponde a cada campo. Se leyó ${l.cantidad} × ${l.precio_unitario} = ${l.importe} del fragmento "${l.cita}". Confirme estos valores antes de aprobar.`,
      );
    }
    if (typeof l.descripcion !== 'string' || l.descripcion.trim().length === 0) {
      huecos.push(`Línea ${i + 1}: falta la descripción. Se descarta.`);
      return null;
    }
    // La descripción tiene que salir del documento, no de la imaginación del
    // modelo. Se acepta que cite una parte de la línea, pero esa parte tiene
    // que estar ahí.
    if (!textoRespaldadoPor(l.descripcion, l.cita)) {
      huecos.push(
        `Línea ${i + 1}: la descripción "${l.descripcion}" no aparece dentro de su propia cita. Se descarta.`,
      );
      return null;
    }
    if (typeof l.codigo === 'string' && !textoRespaldadoPor(l.codigo, l.cita)) {
      huecos.push(`Línea ${i + 1}: el código "${l.codigo}" no aparece dentro de su propia cita. Se descarta.`);
      return null;
    }
    // La calidad cambia el resultado de revisión, así que también necesita
    // respaldo: no se acepta un "usado" que el documento nunca dijo.
    let calidad: CalidadRepuesto | undefined;
    if (l.calidad === 'original' || l.calidad === 'alterno' || l.calidad === 'usado') {
      if (textoRespaldadoPor(l.calidad, l.cita)) {
        calidad = l.calidad;
      } else {
        huecos.push(
          `Línea ${i + 1}: la calidad "${l.calidad}" no aparece en el documento: se omite y la partida queda sin calidad declarada.`,
        );
      }
    }

    const precioUnitario = centavosDesde(l.precio_unitario);
    const importe = centavosDesde(l.importe);
    return {
      codigo: typeof l.codigo === 'string' ? l.codigo : undefined,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: precioUnitario ?? -1,
      importe: importe ?? -1,
      calidad,
      textoOriginal: l.cita,
    } satisfies Partial<LineaCruda>;
  });

  const lineasValidas = lineas.filter((l): l is LineaCruda => l !== null);

  const subtotal = subtotalB !== undefined ? centavosDesde(subtotalB) : undefined;
  const itbms = itbmsB !== undefined ? centavosDesde(itbmsB) : undefined;
  const total = totalB !== undefined ? centavosDesde(totalB) : undefined;

  const factura = {
    numero,
    siniestro,
    taller,
    placa,
    fecha,
    lineas: lineasValidas,
    subtotalDeclarado: subtotal ?? -1,
    itbmsDeclarado: itbms ?? -1,
    totalDeclarado: total ?? -1,
  };

  return { factura, huecos, ambiguas };
}

/**
 * Lee una factura escrita en prosa libre y devuelve, si es posible, una
 * FacturaCruda lista para el motor determinista. Nunca lanza: cualquier
 * fallo —de red, del modelo, o de validación— vuelve como
 * `{ ok: false, problemas: [...] }`.
 */
export async function extraerFactura(entradaTexto: unknown): Promise<ResultadoExtraccion> {
  const t0 = performance.now();

  // El documento completo se valida con su propio límite (6000 caracteres),
  // no con el límite de 400 pensado para campos cortos como un código o una
  // cita. Confundir los dos rechazaba cualquier factura real de más de 400
  // caracteres con un mensaje que ni siquiera explicaba el motivo correcto.
  if (!esDocumentoUtil(entradaTexto, LIMITE_CARACTERES_ENTRADA)) {
    const vacio = typeof entradaTexto !== 'string' || entradaTexto.trim().length === 0;
    return {
      ok: false,
      problemas: [
        vacio
          ? 'No hay texto de factura para leer.'
          : `El texto pegado supera el límite de ${LIMITE_CARACTERES_ENTRADA} caracteres.`,
      ],
      ambiguas: [],
      ms: performance.now() - t0,
    };
  }

  // Pasada la guarda, ya sabemos que es un texto dentro del límite.
  const textoOriginal: string = entradaTexto;

  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) {
    return {
      ok: false,
      problemas: [
        'No hay una clave de API configurada en el servidor (ANTHROPIC_API_KEY en .env.local).',
      ],
      ambiguas: [],
      ms: performance.now() - t0,
    };
  }

  const cliente = new Anthropic({ apiKey: clave, timeout: 30_000 });

  let respuesta;
  try {
    respuesta = await cliente.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system:
        'Lees facturas de taller mecánico en español de Panamá y reportas sus campos con la herramienta reportar_factura. ' +
        'Para CADA dato que reportes, el campo _cita correspondiente debe ser un fragmento copiado LITERALMENTE del texto que te dieron — ' +
        'ni resumido, ni traducido, ni corregido. Si un dato no aparece de forma clara y literal en el texto, NO LO REPORTES: omite el campo. ' +
        'Nunca completes un dato con una suposición razonable. Es preferible reportar menos datos que inventar uno solo. ' +
        'En la cita de cada línea, incluye SIEMPRE el renglón completo tal como aparece, con sus rótulos si los tiene ' +
        '("cantidad", "unidades", "horas", "precio", "importe", "total"). Esos rótulos son lo que permite verificar qué número ' +
        'es la cantidad y cuál el precio: una cita recortada a un solo número deja la lectura sin confirmar. ' +
        'NO corrijas la factura: si los números del documento no cuadran entre sí, cópialos tal como están. ' +
        'Detectar ese error no es tu trabajo, y alterarlo impediría que alguien más lo detecte.',
      tools: [HERRAMIENTA],
      tool_choice: { type: 'tool', name: 'reportar_factura' },
      messages: [{ role: 'user', content: textoOriginal }],
    });
  } catch (e) {
    return {
      ok: false,
      problemas: [`No se pudo leer la factura con el modelo: ${(e as Error).message}`],
      ambiguas: [],
      ms: performance.now() - t0,
    };
  }

  if (respuesta.stop_reason === 'max_tokens') {
    return {
      ok: false,
      problemas: [
        'La factura es demasiado larga para leerla de una sola vez: la respuesta quedó cortada. Prueba con menos líneas.',
      ],
      ambiguas: [],
      ms: performance.now() - t0,
    };
  }

  const bloque = respuesta.content.find((b) => b.type === 'tool_use');
  if (!bloque || bloque.type !== 'tool_use') {
    return {
      ok: false,
      problemas: ['El modelo no devolvió una extracción estructurada.'],
      ambiguas: [],
      crudo: respuesta.content,
      ms: performance.now() - t0,
    };
  }

  const { factura, huecos, ambiguas } = aFacturaCruda(bloque.input as FacturaExtraida, textoOriginal);
  const problemasDeForma = validarFactura(factura);
  const problemas = [...huecos, ...problemasDeForma];

  if (problemas.length > 0) {
    return { ok: false, problemas, ambiguas, crudo: bloque.input, ms: performance.now() - t0 };
  }

  return {
    ok: true,
    factura: factura as FacturaCruda,
    problemas: [],
    ambiguas,
    ms: performance.now() - t0,
  };
}
