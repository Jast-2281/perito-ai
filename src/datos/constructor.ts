// Constructor de facturas para el corpus. Calcula subtotal, ITBMS y total
// correctamente salvo que la prueba los pise a propósito: así, una trampa
// aritmética es explícita y todo lo demás queda limpio.

import type { FacturaCruda, LineaCruda, CalidadRepuesto } from '../dominio/tipos.ts';
import { centavos, itbmsSobre, importeEsperado, formato } from '../dominio/dinero.ts';
import { TARIFARIO } from './tarifario.ts';

const CATALOGO = new Map(TARIFARIO.map((p) => [p.codigo, p]));

export interface EspecLinea {
  codigo?: string;
  descripcion?: string;
  cantidad: number;
  /** Precio unitario en balboas. Si se omite, usa el del tarifario. */
  precio?: number;
  /** Importe en balboas, para forzar un error aritmético. */
  importe?: number;
  calidad?: CalidadRepuesto;
  /** Omite el texto original, para probar el camino de cita reconstruida. */
  sinTexto?: boolean;
}

export interface EspecFactura {
  numero: string;
  siniestro: string;
  taller: string;
  placa: string;
  fecha: string;
  lineas: EspecLinea[];
  /** Pisan los totales calculados, en balboas. */
  subtotal?: number;
  itbms?: number;
  total?: number;
}

export function construirFactura(e: EspecFactura): FacturaCruda {
  const lineas: LineaCruda[] = e.lineas.map((l) => {
    const p = l.codigo ? CATALOGO.get(l.codigo) : undefined;
    const precioUnitario =
      l.precio !== undefined ? centavos(l.precio) : (p?.precioAcordado ?? 0);
    const importe =
      l.importe !== undefined
        ? centavos(l.importe)
        : importeEsperado(l.cantidad, precioUnitario);
    const descripcion = l.descripcion ?? p?.descripcion ?? 'Partida sin descripción';
    const unidad = p?.unidad === 'hora' ? 'h' : 'u';
    return {
      codigo: l.codigo,
      descripcion,
      cantidad: l.cantidad,
      precioUnitario,
      importe,
      calidad: l.calidad,
      textoOriginal: l.sinTexto
        ? undefined
        : `${l.codigo ?? '(sin código)'}  ${descripcion}  ${l.cantidad}${unidad} x ${formato(precioUnitario)}  ${formato(importe)}`,
    };
  });

  const subtotalCalculado = lineas.reduce((a, l) => a + l.importe, 0);
  const subtotalDeclarado =
    e.subtotal !== undefined ? centavos(e.subtotal) : subtotalCalculado;
  const itbmsDeclarado =
    e.itbms !== undefined ? centavos(e.itbms) : itbmsSobre(subtotalDeclarado);
  const totalDeclarado =
    e.total !== undefined ? centavos(e.total) : subtotalDeclarado + itbmsDeclarado;

  return {
    numero: e.numero,
    taller: e.taller,
    siniestro: e.siniestro,
    placa: e.placa,
    fecha: e.fecha,
    lineas,
    subtotalDeclarado,
    itbmsDeclarado,
    totalDeclarado,
  };
}
