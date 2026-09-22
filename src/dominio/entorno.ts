import type { Entorno } from './motor.ts';
import { TARIFARIO, TALLERES } from '../datos/tarifario.ts';
import { SINIESTROS, CODIGOS_PREVIOS } from '../datos/siniestros.ts';

export function entornoPorDefecto(): Entorno {
  return {
    tarifario: new Map(TARIFARIO.map((p) => [p.codigo, p])),
    talleres: new Map(TALLERES.map((t) => [t.codigo, t])),
    siniestros: new Map(SINIESTROS.map((s) => [s.numero, s])),
    codigosPreviosPorSiniestro: new Map(
      Object.entries(CODIGOS_PREVIOS).map(([k, v]) => [k, new Set(v)]),
    ),
  };
}
