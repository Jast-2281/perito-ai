// Validación de entrada.
//
// El motor no toca un documento que no puede auditar. Hoy las facturas vienen
// de un corpus nuestro y nada de esto haría falta; en cuanto un modelo extraiga
// campos de un texto pegado, esta es la única barrera entre una alucinación y
// un dictamen con cifras.
//
// La regla: rechazar antes de calcular, nunca inventar un valor razonable.

import type { FacturaCruda } from './tipos.ts';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Enteros de centavos: finitos, enteros, y dentro de un rango sensato. */
const TECHO_CENTAVOS = 100_000_000; // B/. 1,000,000.00
const MAX_LINEAS = 300;

function esCentavos(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= TECHO_CENTAVOS;
}

function esCantidad(v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  if (v <= 0 || v > 10_000) return false;
  // A lo sumo dos decimales: el resto es ruido de extracción.
  return Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
}

export function esTextoUtil(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 400;
}

/**
 * Para el documento completo que el usuario pega, no para un campo. El límite
 * es mucho más alto porque una factura real, en prosa, no cabe en 400
 * caracteres — ese límite es para nombres, códigos y citas cortas, no para el
 * texto de origen entero.
 */
export function esDocumentoUtil(v: unknown, maximo: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maximo;
}

const CALIDADES = new Set(['original', 'alterno', 'usado']);


/**
 * Devuelve la lista de problemas del documento. Vacía significa auditable.
 * Nunca lanza: una excepción no es un dictamen.
 */
export function validarFactura(f: unknown): string[] {
  const p: string[] = [];
  if (typeof f !== 'object' || f === null) return ['La factura no es un objeto.'];
  const d = f as Partial<FacturaCruda>;

  for (const campo of ['numero', 'taller', 'siniestro', 'placa'] as const) {
    if (!esTextoUtil(d[campo])) p.push(`Falta el campo ${campo} o no es un texto válido.`);
  }

  if (typeof d.fecha !== 'string' || !FECHA.test(d.fecha)) {
    p.push('La fecha no viene en formato AAAA-MM-DD.');
  } else {
    // Una sola expresión, y que no pueda lanzar: `2026-99-99` no es parseable
    // y `2026-02-31` sí lo es pero se desborda a marzo. Los dos casos son la
    // misma pregunta — ¿la fecha que escribieron existe? — así que una sola
    // regla los cubre.
    const t = Date.parse(`${d.fecha}T00:00:00Z`);
    const existe = Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d.fecha;
    if (!existe) p.push(`La fecha ${d.fecha} no existe en el calendario.`);
  }

  if (!Array.isArray(d.lineas)) {
    p.push('La factura no trae líneas.');
  } else if (d.lineas.length === 0) {
    p.push('La factura no tiene ninguna línea: no hay nada que auditar.');
  } else if (d.lineas.length > MAX_LINEAS) {
    p.push(`La factura trae ${d.lineas.length} líneas y el límite es ${MAX_LINEAS}.`);
  } else {
    d.lineas.forEach((l, i) => {
      const n = i + 1;
      if (!esTextoUtil(l?.descripcion)) p.push(`Línea ${n}: descripción vacía o demasiado larga.`);
      if (l?.codigo !== undefined && !esTextoUtil(l.codigo)) p.push(`Línea ${n}: código inválido.`);
      if (l?.textoOriginal !== undefined && !esTextoUtil(l.textoOriginal)) {
        p.push(`Línea ${n}: textoOriginal debe ser un texto no vacío de hasta 400 caracteres.`);
      }
      if (l?.calidad !== undefined && !CALIDADES.has(l.calidad as string)) {
        p.push(`Línea ${n}: calidad "${String(l?.calidad)}" no es un valor reconocido (original, alterno o usado).`);
      }
      if (!esCantidad(l?.cantidad)) {
        p.push(
          `Línea ${n}: cantidad ${String(l?.cantidad)} inválida. Debe ser positiva, finita y con dos decimales como máximo.`,
        );
      }
      if (!esCentavos(l?.precioUnitario) || (l?.precioUnitario ?? -1) < 0) {
        p.push(`Línea ${n}: precio unitario inválido. Debe ser un entero de centavos no negativo.`);
      }
      if (!esCentavos(l?.importe) || (l?.importe ?? -1) < 0) {
        p.push(`Línea ${n}: importe inválido. Debe ser un entero de centavos no negativo.`);
      }
    });
  }

  for (const campo of ['subtotalDeclarado', 'itbmsDeclarado', 'totalDeclarado'] as const) {
    if (!esCentavos(d[campo]) || (d[campo] as number) < 0) {
      p.push(`El campo ${campo} debe ser un entero de centavos no negativo.`);
    }
  }

  return p;
}
