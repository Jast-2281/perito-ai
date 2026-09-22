// Dinero en centavos. Nunca float: un centavo perdido en un redondeo es una
// objeción falsa, y una objeción falsa cuesta más que una fuga.

/** ITBMS vigente en Panamá para servicios y bienes gravados. */
export const ITBMS = 0.07;

/** Cláusula del convenio que fija el impuesto aplicable. */
export const CLAUSULA_ITBMS = 'C-9.1';

export function centavos(montoEnBalboas: number): number {
  return Math.round(montoEnBalboas * 100);
}

export function balboas(cent: number): number {
  return cent / 100;
}

export function formato(cent: number): string {
  const signo = cent < 0 ? '-' : '';
  const abs = Math.abs(cent);
  const entero = Math.floor(abs / 100).toLocaleString('en-US');
  const dec = String(abs % 100).padStart(2, '0');
  return `${signo}B/. ${entero}.${dec}`;
}

/**
 * Importe de una línea. La cantidad puede traer 2 decimales (horas), así que
 * se multiplica en enteros y se redondea al centavo una sola vez.
 */
export function importeEsperado(cantidad: number, precioUnitario: number): number {
  // La cantidad se lleva a centésimas enteras antes de multiplicar: 0.1 * 100
  // en coma flotante da 10.000000000000002, y ese residuo fabrica objeciones
  // falsas de un centavo.
  const centesimas = Math.round(cantidad * 100);
  return Math.round((centesimas * precioUnitario) / 100);
}

export function itbmsSobre(base: number): number {
  return Math.round(base * ITBMS);
}

export function porcentaje(parte: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((parte / total) * 10000) / 100;
}
