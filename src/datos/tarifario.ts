// Tarifario acordado entre la aseguradora y los talleres de la red.
// Datos sintéticos: precios, talleres y códigos son inventados para el
// hackIAthon. No corresponden a ninguna aseguradora ni taller real.

import type { PartidaTarifario, Taller } from '../dominio/tipos.ts';
import { centavos } from '../dominio/dinero.ts';

const r = (
  codigo: string,
  descripcion: string,
  precio: number,
  zonas: PartidaTarifario['zonas'],
  clausula: string,
  calidad: PartidaTarifario['calidad'] = 'alterno',
  // Por defecto NO se asume identidad única: lo conservador es tratar una
  // repetición como ambigua hasta que el catálogo declare lo contrario.
  identidadUnica = false,
): PartidaTarifario => ({
  codigo,
  descripcion,
  tipo: 'repuesto',
  unidad: 'unidad',
  precioAcordado: centavos(precio),
  clausula,
  zonas,
  calidad,
  identidadUnica,
});

const mo = (
  codigo: string,
  descripcion: string,
  precioHora: number,
  horasEstandar: number,
  zonas: PartidaTarifario['zonas'],
  clausula: string,
): PartidaTarifario => ({
  codigo,
  descripcion,
  tipo: 'mano_obra',
  unidad: 'hora',
  precioAcordado: centavos(precioHora),
  clausula,
  zonas,
  horasEstandar,
});

const mat = (
  codigo: string,
  descripcion: string,
  precio: number,
  unidad: PartidaTarifario['unidad'],
  clausula: string,
): PartidaTarifario => ({
  codigo,
  descripcion,
  tipo: 'material',
  unidad,
  precioAcordado: centavos(precio),
  clausula,
  zonas: ['general'],
});

export const TARIFARIO: PartidaTarifario[] = [
  // --- Repuestos: frente ---
  r('REP-F-01', 'Parachoques delantero', 420.0, ['frontal'], 'T-4.1.01', 'alterno', true),
  r('REP-F-02', 'Farol delantero izquierdo', 310.0, ['frontal'], 'T-4.1.02', 'alterno', true),
  r('REP-F-03', 'Farol delantero derecho', 310.0, ['frontal'], 'T-4.1.03', 'alterno', true),
  r('REP-F-04', 'Capó', 580.0, ['frontal'], 'T-4.1.04', 'alterno', true),
  r('REP-F-05', 'Rejilla frontal', 145.0, ['frontal'], 'T-4.1.05', 'alterno', true),
  r('REP-F-06', 'Guardafango delantero izquierdo', 265.0, ['frontal'], 'T-4.1.06', 'alterno', true),
  r('REP-F-07', 'Guardafango delantero derecho', 265.0, ['frontal'], 'T-4.1.07', 'alterno', true),
  r('REP-F-08', 'Condensador de aire acondicionado', 395.0, ['frontal', 'mecanica'], 'T-4.1.08'),
  r('REP-F-09', 'Absorbedor de impacto delantero', 120.0, ['frontal'], 'T-4.1.09'),

  // --- Repuestos: cola ---
  r('REP-T-01', 'Parachoques trasero', 385.0, ['trasera'], 'T-4.2.01', 'alterno', true),
  r('REP-T-02', 'Stop trasero izquierdo', 215.0, ['trasera'], 'T-4.2.02', 'alterno', true),
  r('REP-T-03', 'Stop trasero derecho', 215.0, ['trasera'], 'T-4.2.03', 'alterno', true),
  r('REP-T-04', 'Tapa de baúl', 495.0, ['trasera'], 'T-4.2.04', 'alterno', true),
  r('REP-T-05', 'Panel trasero', 340.0, ['trasera'], 'T-4.2.05', 'alterno', true),

  // --- Repuestos: laterales ---
  r('REP-LI-01', 'Puerta delantera izquierda', 610.0, ['lateral_izq'], 'T-4.3.01', 'alterno', true),
  r('REP-LI-02', 'Puerta trasera izquierda', 575.0, ['lateral_izq'], 'T-4.3.02', 'alterno', true),
  r('REP-LI-03', 'Retrovisor izquierdo', 185.0, ['lateral_izq'], 'T-4.3.03', 'alterno', true),
  r('REP-LD-01', 'Puerta delantera derecha', 610.0, ['lateral_der'], 'T-4.4.01', 'alterno', true),
  r('REP-LD-02', 'Puerta trasera derecha', 575.0, ['lateral_der'], 'T-4.4.02', 'alterno', true),
  r('REP-LD-03', 'Retrovisor derecho', 185.0, ['lateral_der'], 'T-4.4.03', 'alterno', true),

  // --- Repuestos: techo y cristales ---
  r('REP-C-01', 'Parabrisas delantero', 330.0, ['frontal', 'techo'], 'T-4.5.01', 'alterno', true),
  r('REP-C-02', 'Panel de techo', 720.0, ['techo'], 'T-4.5.02', 'alterno', true),

  // --- Repuestos: mecánica ---
  r('REP-M-01', 'Radiador', 355.0, ['mecanica', 'frontal'], 'T-4.6.01', 'alterno', true),
  r('REP-M-02', 'Amortiguador delantero', 210.0, ['mecanica'], 'T-4.6.02'),

  // --- Mano de obra ---
  mo('MO-DES-01', 'Desabolladura de panel (por panel)', 28.0, 4.0, ['general'], 'T-5.1.01'),
  mo('MO-PIN-01', 'Preparación y pintura de panel', 32.0, 5.0, ['general'], 'T-5.1.02'),
  mo('MO-ARM-01', 'Desarmado y armado de conjunto', 26.0, 3.0, ['general'], 'T-5.1.03'),
  mo('MO-ALI-01', 'Alineación y balanceo', 24.0, 1.5, ['mecanica'], 'T-5.1.04'),
  mo('MO-DIA-01', 'Diagnóstico electrónico', 35.0, 1.0, ['general'], 'T-5.1.05'),
  mo('MO-CRI-01', 'Montaje de cristal', 30.0, 2.0, ['frontal', 'techo'], 'T-5.1.06'),

  // --- Materiales de pintura (topados al 35% de la mano de obra) ---
  mat('MAT-BAS-01', 'Base bicapa', 46.0, 'litro', 'T-7.1.01'),
  mat('MAT-BAS-02', 'Base bicapa premium', 46.5, 'litro', 'T-7.1.05'),
  mat('MAT-LAC-01', 'Laca transparente', 52.0, 'litro', 'T-7.1.02'),
  mat('MAT-MAS-01', 'Masilla poliéster', 18.0, 'unidad', 'T-7.1.03'),
  mat('MAT-ABR-01', 'Kit de abrasivos', 12.0, 'unidad', 'T-7.1.04'),
];

export const TALLERES: Taller[] = [
  { codigo: 'TLR-001', nombre: 'Autocolor Vía España', enRed: true, clausula: 'C-3.1.01' },
  { codigo: 'TLR-002', nombre: 'Taller Betania Motors', enRed: true, clausula: 'C-3.1.02' },
  { codigo: 'TLR-003', nombre: 'Carrocería Colón Express', enRed: true, clausula: 'C-3.1.03' },
  { codigo: 'TLR-004', nombre: 'Multiservicios San Miguelito', enRed: true, clausula: 'C-3.1.04' },
  { codigo: 'TLR-099', nombre: 'Taller El Ahorro', enRed: false, clausula: 'C-3.2.01' },
];
