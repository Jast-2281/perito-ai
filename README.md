# PERITO AI — la objeción con el tarifario en la mano

Agente de **auditoría de facturación de siniestros**: lee la factura que el taller manda a la
aseguradora y la objeta línea por línea contra el tarifario acordado, citando la cláusula que
sostiene cada decisión.

Reto 2 del hackIAthon Panamá 2026, 4ta edición.

> **El agente no aprueba pagos: objeta con el tarifario en la mano.** El modelo lee y cita; lo que
> se paga lo decide un motor determinista sobre el texto del convenio. Si un dato no tiene cita
> textual en la factura, no existe: esa línea no se reconoce.

## Aviso

- Es un **prototipo de hackathon**, no un sistema en producción ni un producto de ninguna
  aseguradora.
- **Todos los datos son sintéticos**: tarifarios, talleres, placas, pólizas, siniestros y facturas
  son inventados.
- No sustituye el criterio del perito: cuando la objeción pasa del 40% de la factura o de
  B/.1,000.00, **deriva**.

## Qué problema resuelve

Una aseguradora de auto recibe miles de facturas de taller al mes. Revisarlas a mano es caro, así
que en la práctica se revisan por muestreo y el resto se paga. Ahí se va la fuga: sobreprecios
sobre el tarifario acordado, horas de mano de obra por encima del tiempo estándar, piezas
facturadas dos veces en el mismo siniestro, piezas de una zona del vehículo que el choque nunca
tocó, materiales de pintura sin tope, y errores de aritmética que nadie recalcula.

PERITO AI audita el 100% de las facturas y devuelve, en milisegundos, **cuánto se paga, cuánto se
objeta y por qué cláusula**, más el borrador de la objeción al taller.

El diferenciador no es «usamos IA». Es el reparto de trabajo: **el modelo solo lee y cita; lo que
se paga lo calcula un motor determinista sobre el tarifario**.

## Cómo funciona

1. **Entra una factura** desde el corpus precargado. **Todavía no existe entrada de facturas
   nuevas ni lectura con modelo de lenguaje**: es el trabajo pendiente número uno y está en la
   sección de limitaciones.
2. **Lectura**: cada dato viaja con el fragmento textual del que salió y con su procedencia.
   `documento` es texto literal de la factura; `reconstruida` es un resumen que arma el motor con
   los campos, y **no prueba** que la factura diga eso, así que esa línea queda pendiente de
   revisión y nunca se aprueba sola.
3. **Puertas de admisión**, en orden fijo, y la primera que falla cierra la factura entera:
   siniestro existe, placa coincide, siniestro abierto, factura dentro de vigencia, factura
   posterior al choque, taller autorizado y asignado.
4. **Puerta cero — validación de entrada** (`src/dominio/validacion.ts`), y corre **antes de leer
   un solo campo** del objeto que llega: `auditar()` no confía en que la entrada tenga la forma de
   una factura, la comprueba primero. Un `null`, un `undefined`, cantidades negativas o no
   finitas, importes que no son enteros de centavos, fechas que no existen en el calendario, o un
   `textoOriginal` o una `calidad` con un tipo o un valor que no está en el catálogo — todo eso se
   devuelve como no procesable, sin que el motor toque una sola cifra. Hoy las facturas vienen de
   un corpus nuestro y esto no haría falta; en cuanto un modelo extraiga campos de un texto
   pegado, es la única barrera entre una alucinación y un dictamen con cifras.
5. **Auditoría de línea**, también en orden fijo: catálogo, duplicado en la factura, duplicado
   contra facturas anteriores del siniestro, coherencia con el daño reportado, sobreprecio contra
   tarifario, horas contra tiempo estándar, calidad de repuesto contra la póliza, y aritmética.
6. **Cierre de factura**: tope de materiales de pintura (35% de la mano de obra reconocida) y
   suma asegurada disponible. Después, la **conciliación del documento consigo mismo**: las líneas
   tienen que sumar el subtotal declarado, el ITBMS tiene que ser el 7% de ese subtotal, y el
   total tiene que ser la suma de los dos. Si algo de eso no cierra, la factura queda `PENDIENTE`
   con importe reconocido cero: se devuelve al taller, no se paga en parte. **Los importes
   declarados se conservan tal cual**; el motor publica los suyos al lado (`totalCalculado`) y
   nunca sustituye la cifra de origen por una que cuadre.
7. **Dictamen**: estado, motivos con su cláusula y su cita literal, reparto del monto, y el
   porcentaje objetado.

Si dos razones cierran la misma línea, **solo una lleva el monto**: la plata se objeta una vez. Y
cuando una línea se cierra entera, las demás razones explican pero no reparten un centavo más: si
los motivos suman más que lo objetado, la trazabilidad deja de servir.

**Un código repetido no siempre es el mismo hallazgo.** Si la cantidad y el precio coinciden
exactamente con la ocurrencia anterior, es un duplicado cierto y se cierra solo. Si difieren, es
ambiguo — pueden ser dos piezas u operaciones legítimas con el mismo código — y el motor lo marca
`POSIBLE_DUPLICADO` sin objetar nada por su cuenta: decide una persona.

**El dinero de una factura se reparte en tres, nunca en dos.** Lo que se paga (`totalAPagar`), lo
que tiene un hallazgo real detrás (`totalObjetado`) y lo que solo está pendiente de que el
documento cierre consigo mismo (`montoPorConciliar`). Los tres siempre suman el total que declaró
el taller. Antes de esta distinción, un documento que no conciliaba aparecía como "100% objetado"
aunque no hubiera ni un solo hallazgo de dinero — mezclaba una corrección de forma con una
acusación de fondo.

**La necesidad de revisión humana se guarda aparte del estado económico.** Un ajuste de dinero
posterior —el tope de materiales, por ejemplo— no puede borrar una evidencia que falta ni una
autorización pendiente. `requiereRevision` y el estado del dictamen dicen siempre lo mismo, y cada
dictamen lleva la lista de por qué hace falta una persona.

El dinero de cada línea sale de **una sola base**: el importe que el tarifario sostiene, calculado
con la cantidad reconocible y el precio reconocible. Lo objetado es la diferencia contra lo que la
línea cobró, y las explicaciones (sobreprecio, horas, aritmética) se reparten ese monto sin
excederlo. Un precio unitario alto con el importe ya ajustado no descuenta nada.

## Estados

| Estado | Qué significa |
| --- | --- |
| `CONFORME` | Se paga completa |
| `OBJETADA_PARCIAL` | Se paga lo reconocido; el resto se objeta con cláusula |
| `RECHAZADA` | No se reconoce ninguna línea |
| `DERIVADA` | La objeción supera el umbral, o hay un posible duplicado ambiguo: decide un perito |
| `PENDIENTE` | Falta una autorización, o la factura no concilia consigo misma. No procede pagar |
| `INVALIDA` | No procesable: la entrada no tiene forma de factura, ni siquiera para intentar auditarla |

`PENDIENTE` existe para que «no pude verificar esto» nunca se lea como «está aprobado» ni como
«hay que rechazarlo».

## Verificación reproducible

```bash
npm run check             # las cinco puertas, sin red y sin claves
npm run check:trampas     # el guantelete: 80 facturas con dictamen conocido
npm run check:cobertura   # ¿hay alguna regla que ninguna trampa llega a ejecutar?
npm run check:extraccion  # 32 respuestas simuladas del modelo, incluidas las que mienten
npm run check:integracion # el recorrido completo: texto → extracción → motor → dictamen
npm run check:mutantes    # rompe el motor regla por regla y exige que el guantelete se dé cuenta
```

Las cinco puertas son distintas a propósito, y una no sustituye a otra:

- **El guantelete** prueba que el motor da el dictamen correcto.
- **La cobertura** prueba que ninguna regla queda sin ejecutarse jamás — una regla que nunca corre
  no puede tener un mutante que muera, así que sin esta puerta los mutantes darían un número
  engañosamente bueno. También advierte de reglas sostenidas por una sola trampa, que quedan sin
  vigilancia en cuanto esa trampa cambia por otro motivo.
- **La extracción** prueba que una respuesta del modelo que miente no llega al motor. Corre sin
  red y sin clave: simula lo que el modelo pudo haber respondido.
- **La integración** prueba la costura entre las dos mitades. Existe porque las otras puertas no
  la veían: la extracción marcaba una lectura como pendiente de confirmar, el motor decía
  CONFORME, y cada mitad estaba bien por su cuenta mientras el resultado combinado le mostraba al
  perito dos mensajes contradictorios. Su invariante principal es que un aviso de lectura sin
  confirmar y un dictamen conforme **no pueden coexistir**.
- **Los mutantes** prueban que el guantelete detectaría una regla rota.

### El guantelete

80 facturas con el dictamen que deben producir. **Diez de ellas son limpias a propósito**, y están
diseñadas para provocar una objeción falsa:

- horas decimales exactamente en el estándar (1.5 h)
- cantidad `0.29` a B/.46.50, donde `0.29 * 100` en coma flotante da `28.999999999999996` y el
  importe correcto cae justo en el medio centavo
- materiales exactamente en el 35% del tope
- un repuesto alterno con póliza de calidad indistinta
- una descripción que dice «juego duplicado de sellos» sin ser un duplicado — trampa textual para
  un modelo que lea por palabras clave
- un taller que cobra **de menos**: se deja constancia y no se objeta un centavo

Una aprobación indebida es grave. Una objeción falsa también: quema la relación con el taller y la
aseguradora la paga en la siguiente negociación de tarifario.

El corpus también cubre los **bordes numéricos** por pares, porque un motor de dinero falla en el
borde y no en el medio: precio exactamente igual al tarifario contra un centavo por encima; horas
exactamente en el estándar contra un cuarto de hora de más; materiales justo en el 35% contra
veinte centavos por encima; factura el último día de vigencia contra un día después; factura el
mismo día del siniestro contra un día antes; suma asegurada agotada exactamente contra excedida.

### La extracción con IA

Treinta y dos respuestas simuladas del modelo, sin llamar a la API. La mitad son ataques a la regla que
sostiene todo el proyecto — *el modelo lee y cita, nunca decide*:

- una sola palabra del documento ("Factura") citada como respaldo de **todos** los campos, con
  valores completamente inventados
- una cita real pero que pertenece a **otra línea** de la factura
- una cita que contiene el importe pero no la cantidad ni el precio que dice respaldar
- un código de tarifario que no aparece dentro de su propia cita
- citas vacías, nulas, o que son un número o un objeto en vez de texto
- `NaN` e `Infinity` como importes
- una respuesta que es `null` entera

- cantidad y precio **intercambiados**: el documento dice "cantidad 2, precio B/.100", el modelo
  reporta cantidad 100 y precio 2. Los tres números están en la cita y la multiplicación sigue
  dando 200, así que verificar cada número por separado no lo detecta. Se detecta comparando cada
  valor contra la **etiqueta** que el texto le pone ("cantidad", "precio", "importe")
- una descripción de partida que el documento nunca menciona
- una calidad de repuesto ("usado") inventada, que sí cambia el resultado de revisión
- un `null` dentro del arreglo de líneas

Y los casos legítimos que **no** deben rechazarse: citas con saltos de línea y espacios dobles
(como salen de copiar un PDF), importes con separador de miles, y fechas normalizadas — el
documento dice `20/07/2026` y el modelo reporta `2026-07-20`: es la misma fecha, y se comprueba
equivalencia contra una lista explícita de formatos en vez de exigir coincidencia literal.

### Los mutantes

Un guantelete que nunca falla no prueba nada. `check:mutantes` copia el proyecto 24 veces, rompe
una regla distinta en cada copia (desactiva el chequeo de sobreprecio, mueve el tope de materiales
del 35% al 50%, cambia el `>` de las horas por `>=`, quita el redondeo de centésimas, sube el
umbral de derivación al 95%) y **exige que el guantelete falle**. Un mutante que sobrevive es una
regla que nadie estaba probando.

La primera corrida encontró dos: el redondeo de centésimas y la regla de no contar dos veces un
cierre. Las dos trampas que faltaban están ahora en el corpus.

Un mutante solo cuenta como muerto si el guantelete **falló una aserción**. Si el proceso se cae,
al mutante lo detectó el compilador y no la prueba: eso se reporta aparte como no concluyente. La
primera versión de este script contaba las caídas como aciertos e inflaba el resultado.

## Resultados medidos

| Qué se midió | Resultado |
| --- | --- |
| Guantelete | **80 de 80** · 0 aprobaciones indebidas · 0 objeciones falsas |
| Cobertura de reglas | **21 de 21** motivos · **6 de 6** estados, sin reglas frágiles |
| Extracción con IA (simulada, sin red) | **32 de 32** |
| Integración (extracción + motor) | **8 de 8** |
| Mutantes muertos | **59 de 59**, sin contar caídas del proceso |
| Motor determinista (80 facturas) | media **0.048 ms** · p95 **0.141 ms** |
| Build de producción | limpio, tipos validados |
| `npm audit --omit=dev` | 0 vulnerabilidades |

Máquina de medición: contenedor Linux x86-64, Node 22.22.2. Las cinco puertas se reprodujeron
también en un MacBook Pro con Apple Silicon, con los mismos resultados.

### Verificado contra el proveedor real

El recorrido completo —texto pegado → lectura con modelo → auditoría— se ejecutó contra la API de
Anthropic con tres facturas nuevas, ninguna del corpus:

| Factura | Resultado | Lo que demuestra |
| --- | --- | --- |
| Correcta, con fecha `20/07/2026` | `CONFORME`, objetado B/.0.00 | El formato de fecha panameño se normaliza sin rechazar |
| `1 × B/.420.00` cobrado como B/.520.00 | `OBJETADA`, **B/.107.00** objetado, motivo `ARITMETICA_LINEA`, cláusula C-9.2 | El modelo lee fielmente una factura incorrecta y el motor la objeta con su cita literal |
| Los mismos números correctos, sin rótulos | `PENDIENTE`, objetado B/.0.00 | Aunque las cuentas cuadren, una lectura que no se puede probar no se aprueba sola |

Los B/.107.00 de la segunda son los B/.100.00 de la línea más el 7% de ITBMS cobrado sobre ellos:
lo objetado no es el error, es **lo que no se debe pagar**.

Latencia medida de punta a punta: la lectura con modelo domina el tiempo (unos segundos), y el
motor determinista aporta entre 0.2 y 11 ms. Son magnitudes distintas y el pie de cada dictamen
las muestra por separado, para no presentar la velocidad del motor como si fuera la del sistema.

**Ese tiempo es el del motor, no la latencia del sistema.** Cuando exista la lectura con modelo,
la latencia de punta a punta la dominará la llamada al modelo y habrá que medirla aparte.

`55 de 55` es una base de regresión, no un certificado de ausencia de errores. Ocho revisiones
externas sucesivas encontraron treinta fallos que estas mismas pruebas no veían: totales sin
conciliar, un descuento aplicado dos veces, una autorización pendiente presentada como
conformidad, un subtotal falso que producía conformidad, explicaciones que sumaban más que lo
objetado, un ajuste de dinero que borraba la marca de evidencia faltante, cantidades negativas
aceptadas, facturas sin líneas aceptadas, el motor reventando con una entrada `null` o
`undefined` en vez de devolver un dictamen, campos de evidencia (`textoOriginal`, `calidad`) sin
validar, un monto "por conciliar" que se contaba como "objetado" e inflaba el tablero, un límite
de 400 caracteres que rechazaba cualquier factura real, una cita existente pero irrelevante que
respaldaba datos inventados, el formulario de factura nueva omitiendo los motivos a nivel de
factura, un porcentaje de 7476% sobre un documento que no conciliaba, duplicados de mano de obra
tratados como ciertos sin poder demostrarlo, `aFacturaCruda(null)` reventando, una extracción que aceptaba cantidad y precio
intercambiados, descripciones y calidades inventadas sin respaldo en el documento, un `null`
dentro del arreglo de líneas que reventaba la conversión, fechas válidas rechazadas por venir en
otro formato, una regla de duplicados apoyada en una suposición falsa sobre nuestro propio
catálogo, una extracción que rechazaba facturas con errores aritméticos reales —impidiendo
auditarlas—, una detección de intercambio por posición que rechazaba facturas legítimas con el
precio antes que la cantidad, una lectura ambigua que terminaba como CONFORME porque las
advertencias de extracción no llegaban al dictamen, una sola etiqueta que bastaba para dar por
verificados los tres campos de una línea, una etiqueta con números a ambos lados que elegía una
lectura en silencio y rechazaba la correcta, el dígito final de un código de tarifario leído como
si fuera una cifra, y un número que ya pertenecía a otra etiqueta contado como candidato de la
siguiente. Los treinta están corregidos con su regresión en el corpus. Que existieran es el dato honesto, y por eso las
cifras de arriba se publican junto al comando que las reproduce.

## Instalación

Requiere **Node 22.6 o superior**: los scripts de verificación usan `--experimental-strip-types`,
que llegó en esa versión. Hay un `.nvmrc` con la versión usada para medir.

```bash
npm install
npm run build && npm run start   # http://localhost:3000
npm run dev                      # desarrollo
```

El motor de decisión **corre sin red y sin claves**, y hoy la aplicación entera también: no hay
ninguna llamada a un modelo ni a Notion en esta versión.

## Qué sale a la red y qué no

| Parte | Dónde corre | Sale a internet |
| --- | --- | --- |
| Motor de decisión (`src/dominio/motor.ts`) | En el servidor, sin red | **No** |
| Corpus y tarifario (`src/datos/`) | En el servidor | **No** |
| Lectura de facturas en prosa | *No implementado todavía* | — |

## Dónde está todo

| Carpeta | Qué contiene |
| --- | --- |
| `src/dominio/` | Tipos, dinero en centavos, motor determinista y entorno. Sin dependencias de la web |
| `src/datos/` | Tarifario acordado, talleres, siniestros, constructor de facturas y el guantelete |
| `app/` | Pantallas de Next.js |
| `src/ia/` | Lectura de facturas en prosa con un modelo, con cita obligatoria verificada |
| `scripts/` | Las cinco puertas de calidad |

## La frontera entre leer y juzgar

Es la línea más importante del diseño, y romperla fue el peor error que cometimos:

- **La extracción responde una sola pregunta: ¿el modelo leyó fielmente lo que el documento
  dice?** Nada más.
- **El motor responde la otra: ¿lo que el documento dice está bien?**

Durante una versión, la extracción exigía que `cantidad × precio = importe` antes de aceptar una
línea. Suena razonable y era un error grave: una factura que dice "2 unidades a B/.100, importe
B/.250" **está mal, y por eso mismo es la que hay que auditar**. El motor tiene una regla —
`ARITMETICA_LINEA` — que la objeta por B/.50.00 con su cláusula y su cita. La extracción la estaba
descartando antes de llegar ahí, así que el producto no podía cumplir su función.

Lo mismo con el orden de los campos: deducir que "el primer número es la cantidad" rechazaba
facturas legítimas que ponen el precio primero. Ahora se usan las **etiquetas** del texto. Y
cuando la cita no trae ninguna etiqueta — solo números sueltos — no se adivina: la lectura se
acepta y se marca como **pendiente de confirmación**, visible junto al dictamen.

Hay un mutante dedicado a esto: reintroduce a propósito la comprobación aritmética en la
extracción, y las pruebas lo matan. El error no puede volver en silencio.

### La ausencia de etiqueta no es evidencia favorable

Los tres campos de una línea —cantidad, precio e importe— necesitan **cada uno** su etiqueta en
el texto. Encontrar una sola no verifica las otras dos: en `2 x 100 importe 200` solo está
etiquetado el importe, y si el modelo reporta cantidad 100 y precio 2, ese intercambio no se
puede descartar. Darlo por bueno porque el importe coincide sería justo el error que esta regla
existe para evitar.

Cuando falta la etiqueta de algún campo, la lectura se acepta —los números están en la cita— pero
queda marcada, **nombrando qué campo concretamente** falta confirmar y con qué fragmento. Esa
duda entra al motor como una razón de revisión más, al mismo nivel que una autorización
pendiente: el dictamen sale `PENDIENTE`, nunca `CONFORME`. Un aviso que dice "confirme esta
lectura" junto a un dictamen que dice "sin discrepancias" deja a quien lo lee sin saber si puede
pagar.

## Limitaciones conocidas

- **La cita no se verifica contra el texto original.** El modelo extrae el campo y su fragmento
  de respaldo, pero nadie comprueba todavía que ese fragmento exista literalmente en el
  documento fuente. Es la principal limitación restante: falta buscar el fragmento en el texto
  de origen y rechazar la extracción si no aparece.
- **El deducible no se aplica**: se reporta en el expediente pero no se descuenta del pago.
- **El tarifario está escrito a mano**, no leído de un PDF de convenio.
- **Las trampas las escribió el mismo equipo** que escribió el motor. Una factura de alguien ajeno
  es la prueba que falta.
- **Un solo tipo de siniestro**: colisión y granizo de vehículo. Robo total y pérdida total no
  están modelados.
- **Sin autenticación**: el prototipo no distingue usuarios.
- **Un duplicado solo se declara cierto cuando el catálogo afirma que ese código identifica una
  pieza única del vehículo** (`identidadUnica`). "Capó" la tiene: hay uno. "Amortiguador
  delantero" NO: son dos, izquierdo y derecho, con el mismo código — dos líneas idénticas ahí son
  legítimas. Sin identidad única, la repetición se marca `POSIBLE_DUPLICADO` y decide una persona.
  La propiedad se declara a mano en el tarifario y su valor por defecto es `false`, que es lo
  conservador; si se agrega una partida nueva y se olvida marcarla, el motor será más cauto, no
  menos.

## Trabajo futuro

En orden: verificar automáticamente cada cita contra el texto original antes de confiar en ella; validación en ejecución de lo extraído (campos
obligatorios, fechas, importes finitos en centavos) que pida revisión en vez de inventar datos;
ver el documento al lado del hallazgo; filtrar la bandeja por estado y exportar el informe; y
después el borrador de objeción al taller. Notion queda fuera a propósito: el reto 2 no lo exige y
el tiempo rinde más en el flujo de factura nueva.

## Licencia

MIT. Los datos del corpus son sintéticos y del equipo.
