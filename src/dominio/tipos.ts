// Tipos del dominio. Todo el dinero viaja en centavos (enteros), nunca en float.

export type Zona =
  | 'frontal'
  | 'trasera'
  | 'lateral_izq'
  | 'lateral_der'
  | 'techo'
  | 'interior'
  | 'mecanica'
  | 'general';

export type TipoImpacto =
  | 'frontal'
  | 'trasero'
  | 'lateral_izq'
  | 'lateral_der'
  | 'multiple'
  | 'granizo'
  | 'robo_parcial';

export type TipoPartida = 'repuesto' | 'mano_obra' | 'material' | 'servicio';

export type CalidadRepuesto = 'original' | 'alterno' | 'usado';

export type PoliticaRepuestos = 'original' | 'alterno' | 'indistinto';

/** Una partida del tarifario acordado entre aseguradora y taller. */
export interface PartidaTarifario {
  codigo: string;
  descripcion: string;
  tipo: TipoPartida;
  unidad: 'unidad' | 'hora' | 'litro';
  /** Precio acordado por unidad, en centavos. */
  precioAcordado: number;
  /** Cláusula del tarifario que sostiene el precio. */
  clausula: string;
  /** Zonas del vehículo a las que pertenece la partida. */
  zonas: Zona[];
  /** Solo para repuestos: calidad pactada. */
  calidad?: CalidadRepuesto;
  /**
   * true si el código identifica una pieza única e inequívoca del vehículo:
   * una sola posición, un solo ejemplar. "Capó" la tiene (hay uno). "Retrovisor
   * izquierdo" la tiene (hay uno de ese lado). "Amortiguador delantero" NO la
   * tiene: hay dos, izquierdo y derecho, y comparten código.
   *
   * Solo con identidad única un código repetido con la misma cantidad y el
   * mismo precio puede declararse duplicado cierto. Sin ella, dos líneas
   * idénticas pueden ser dos piezas legítimas y la decisión es de una persona.
   */
  identidadUnica?: boolean;
  /** Solo para mano de obra: horas estándar reconocidas. */
  horasEstandar?: number;
}

export interface Taller {
  codigo: string;
  nombre: string;
  enRed: boolean;
  /** Cláusula del convenio que acredita al taller. */
  clausula: string;
}

export interface Siniestro {
  numero: string;
  poliza: string;
  placa: string;
  asegurado: string;
  fechaOcurrencia: string; // YYYY-MM-DD
  fechaReporte: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  tallerAsignado: string;
  tipoImpacto: TipoImpacto;
  zonasDanadas: Zona[];
  /** Deducible en centavos. */
  deducible: number;
  /** Suma asegurada disponible para este siniestro, en centavos. */
  sumaAsegurada: number;
  politicaRepuestos: PoliticaRepuestos;
  estado: 'abierto' | 'cerrado';
}

/** Línea tal como la manda el taller, sin auditar. */
export interface LineaCruda {
  codigo?: string;
  descripcion: string;
  /** Unidades u horas. Se permite decimal con 2 posiciones. */
  cantidad: number;
  /** Precio unitario cobrado, en centavos. */
  precioUnitario: number;
  /** Importe cobrado por la línea, en centavos, tal como lo escribió el taller. */
  importe: number;
  calidad?: CalidadRepuesto;
  /** Texto literal de la factura del que salió esta línea. Sin cita, no hay objeción. */
  textoOriginal?: string;
}

export interface FacturaCruda {
  numero: string;
  taller: string;
  siniestro: string;
  placa: string;
  fecha: string;
  lineas: LineaCruda[];
  /** Totales declarados por el taller, en centavos. */
  subtotalDeclarado: number;
  itbmsDeclarado: number;
  totalDeclarado: number;
}

// ---------------------------------------------------------------------------
// Resultado de la auditoría
// ---------------------------------------------------------------------------

export type MotivoCodigo =
  | 'FUERA_DE_TARIFARIO'
  | 'SOBREPRECIO'
  | 'HORAS_EXCEDIDAS'
  | 'ZONA_INCOHERENTE'
  | 'CALIDAD_NO_PACTADA'
  | 'DUPLICADO_EN_FACTURA'
  | 'DUPLICADO_ENTRE_FACTURAS'
  | 'POSIBLE_DUPLICADO'
  | 'ARITMETICA_LINEA'
  | 'TOPE_MATERIALES'
  | 'SINIESTRO_INEXISTENTE'
  | 'PLACA_NO_COINCIDE'
  | 'FUERA_DE_VIGENCIA'
  | 'FACTURA_ANTERIOR_AL_SINIESTRO'
  | 'SINIESTRO_CERRADO'
  | 'TALLER_NO_AUTORIZADO'
  | 'ARITMETICA_TOTAL'
  | 'ITBMS_INCORRECTO'
  | 'TOTAL_INCOHERENTE'
  | 'DATOS_INVALIDOS'
  | 'EXCEDE_SUMA_ASEGURADA';

/** Un hallazgo: qué está mal, cuánto vale y qué cláusula lo sostiene. */
export interface Motivo {
  codigo: MotivoCodigo;
  detalle: string;
  /** Monto objetado por este motivo, en centavos. 0 si no tiene monto. */
  monto: number;
  /** Cláusula del tarifario o del convenio que sostiene la objeción. */
  clausula: string;
  /** Texto literal de la factura del que sale el dato objetado. */
  cita: string;
  /**
   * De dónde sale la cita. 'documento' es texto literal de la factura.
   * 'reconstruida' es un resumen armado por el motor a partir de los campos:
   * sirve para leer, NO prueba que el documento diga eso.
   */
  origenCita: 'documento' | 'reconstruida';
}

export type EstadoLinea = 'CONFORME' | 'OBJETADA' | 'DERIVADA';

export interface LineaAuditada {
  indice: number;
  cruda: LineaCruda;
  estado: EstadoLinea;
  /** Importe que la aseguradora reconoce, en centavos. */
  montoReconocido: number;
  /** Importe objetado, en centavos. */
  montoObjetado: number;
  motivos: Motivo[];
  /**
   * Necesidad de intervención humana, guardada aparte del estado económico.
   * Un ajuste posterior de dinero no puede borrar una evidencia que falta ni
   * una autorización pendiente.
   */
  requiereRevision: boolean;
  /** Por qué hace falta una persona. Vacío si no hace falta. */
  razonesRevision: string[];
  /** Partida del tarifario con la que se comparó, si existe. */
  partida?: PartidaTarifario;
}

export type EstadoDictamen =
  /** Sin discrepancias: se reconoce completa. */
  | 'CONFORME'
  /** Con discrepancias cuantificadas. */
  | 'OBJETADA_PARCIAL'
  /** Ninguna línea se reconoce. */
  | 'RECHAZADA'
  /** Supera el umbral: decide un perito, no el agente. */
  | 'DERIVADA'
  /** Falta una autorización o la factura no concilia: no procede pagar aún. */
  | 'PENDIENTE'
  /** No procesable: no pasó las puertas de admisión. */
  | 'INVALIDA';

export interface Dictamen {
  factura: string;
  siniestro: string;
  estado: EstadoDictamen;
  /** Puerta que cerró el caso, si se cerró antes de auditar líneas. */
  puertaQueCerro?: MotivoCodigo;
  /** Total que el taller declaró, tal cual. Nunca se sustituye. */
  totalFacturado: number;
  /** Total que sostienen las líneas más su ITBMS. Puede diferir del declarado. */
  totalCalculado: number;
  /** true si el documento cierra consigo mismo: líneas = subtotal, ITBMS = 7%, total = subtotal + ITBMS. */
  documentoConcilia: boolean;
  totalReconocido: number;
  /** Dinero con un hallazgo del motor detrás: una regla, un monto, una cláusula. */
  totalObjetado: number;
  /**
   * Dinero que no es ni pago ni hallazgo: está a la espera de que el
   * documento concilie consigo mismo. Cero cuando `documentoConcilia` es
   * true. `totalAPagar + totalObjetado + montoPorConciliar` siempre suma
   * `totalFacturado`.
   */
  montoPorConciliar: number;
  /** Porcentaje objetado sobre lo facturado, 0-100 con 2 decimales. */
  /**
   * null cuando el documento no concilia consigo mismo: dividir lo objetado
   * entre un total que ni siquiera es consistente produce números sin
   * sentido (se han visto porcentajes de miles por ciento). "No calculable"
   * es la respuesta honesta, no un número que parece preciso y no lo es.
   */
  porcentajeObjetado: number | null;
  itbmsRecalculado: number;
  totalAPagar: number;
  lineas: LineaAuditada[];
  motivosFactura: Motivo[];
  /** Suma de los importes de las líneas, según la factura. */
  sumaLineas: number;
  /** true si una persona debe intervenir antes de pagar. */
  requiereRevision: boolean;
  /** Por qué hace falta una persona. */
  razonesRevision: string[];
  /** Milisegundos del motor determinista. NO es la latencia del sistema. */
  ms: number;
}
