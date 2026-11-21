# 🗺️ Roadmap — Master Finance Web App

> Documento público del proyecto. Se mantiene libre de datos personales, montos reales o credenciales (toda información privada permanece en `private_docs/`, ignorado por Git).

---

## ✅ Fase 1 — Portafolio Crypto (DCA) _(Completada)_

- [x] Carga y exportación local de transacciones vía CSV (`PapaParse`).
- [x] Cálculo automático de precio promedio de compra (DCA) y P&L.
- [x] Sistema de metas duales (`Target Buy` / `Target Sell`) por moneda.
- [x] Integración de precios en vivo con CoinGecko y modo privacidad (`PrivacyValue`).

---

## ✅ Fase 2 — Motor Quincenal, Sobres y Gastos _(Completada)_

- [x] Arquitectura modular multi-vista Mobile-First (Bottom Nav en móvil, Sidebar en desktop).
- [x] Store persistente en `localStorage` con exportar/importar respaldo JSON.
- [x] **Resumen (Dashboard)**: Patrimonio consolidado en fondos operativos/reserva, cuentas personalizadas (`USD` / `VES`) con CRUD completo y desglose por custodia (`Efectivo`, `USDT`, `Bs`).
- [x] **Meta del Fondo de Emergencia**: Configurable por _X meses de gastos indispensables_ o monto personalizado.
- [x] **Tasa BCV diaria**: Integración automática con `ve.dolarapi.com` + soporte manual offline.
- [x] **Registrar Quincena (Wizard)**: Reglas configurables (`%` o `$ fijo`), provisión automática de gastos mensuales y **Sinking Fund (`Provisiones Anuales`)**.
- [x] **Gastos y Cuentas por Cobrar/Pagar**: Días restantes, prorrateo quincenal, abonos variables, alertas en Dashboard, forma de pago más común por gasto y botón **Deshacer**.
- [x] **Cambio de Custodia Multi-Sobre**: Conversión en una sola operación (ej. USDT ↔ Efectivo ↔ Bolívares) repartida entre múltiples sobres con sugerencia automática según la forma de pago preferida de cada gasto.
- [x] **Motor de Cierre Mensual (Rollover & Sweep)**: Simulación previa con protección de gastos cercanos, fondeo de déficit anual y barridos internos (`SWEEP` / `ROLLOVER`).
- [x] **Guía Rápida ("Cómo usar")**: Buscador local por palabras clave y sinónimos.

---

## 🛠️ Fase 3 — Arreglos, Integración Financiera y Mejoras a Fases 1 y 2 _(Siguiente)_

- [x] **Suite de Pruebas Contables e Invariantes (Vitest)**: Tests automatizados para blindar las fórmulas de Fases 1 y 2 (DCA, saldos por sobre/custodia, transferencias multi-sobre, cierre mensual y deshacer) y establecer verificación continua (`build` + `lint` + `test`) en cada fase.
- [x] **Conexión en vivo Portafolio Crypto ↔ Patrimonio Total**: Vincular los saldos y precios en tiempo real del módulo DCA (`usePortfolioStore` / CoinGecko) con los fondos `Inversiones Binance` y `Billetera BTC` en el Dashboard, más meta global de portafolio configurable.
- [x] **Indicador "Por Asignar" (_Ready to Assign_ estilo YNAB) y Runway**: Mostrar explícitamente en el Dashboard la liquidez libre en cuentas (`Binance USDT`, `Cuenta en Bolívares`, etc.) que aún no tiene sobre asignado, con acción en 1 clic para asignarla, y cálculo de días de cobertura (_Runway_).
- [x] **Motor de Compra Escalonada (_Smart Dip-Buying_) y Alertas Globales**: Tramos fijos anclados al ingreso mensual (`$45 / $70 / $100`) aislados exclusivamente sobre USDT digital libre en Binance (con reserva protegida para DCA quincenal), memoria de compras (_Cooldown_ de doble filtro por nivel + caída adicional y reinicio al rebotar), cola de prioridad determinista sin inflar micro-órdenes (`< $20`), dato referencial de punto de equilibrio DCA y campanita de oportunidades en el Header.
- [x] **Organización de Portafolio y Cierre de Posiciones**: Separación de Activos Crypto vs. Stablecoins, ordenamiento dinámico y manual (_drag & drop_ / flechas persistentes) y archivo de monedas cerradas en un _Histórico de Profit Realizado_.
- [x] **Barra de Exposición y Balanceo del Portafolio**: Barra segmentada encima de los activos crypto (por grupo estratégico `BTC / ETH / SOL / Oro / Altcoins` o por moneda individual, con inclusión opcional del `USDT` digital libre) y metas `%` configurables que calculan cuántos dólares faltan o sobran para balancear el portafolio.
- [x] **Exportador de Resumen del Portafolio y Liquidez para IA**: Botón `🤖 Resumen para IA` para copiar al portapapeles o descargar en Markdown la exposición actual vs. objetivo, posiciones activas, señales/Cooldown y liquidez disponible listo para analizar con una IA.
- [x] **Motor Dual-Rate (BCV + Paralelo/USDT), Perfil Regional y Modificadores Rápidos (`+16% IVA`, `+10% Servicio/Propina`, `+3% IGTF`)**: Doble tasa cambiaria con cálculo de brecha cambiaria (ahorro en gastos Bs vs ganancia en conversión), botones calculadores de IVA, propina/servicio e IGTF en tiempo real y perfil regional configurable (`VE` / `GLOBAL`).
- [ ] **Calendario de Flujo de Caja (30 días) y Analítica Mensual**: Línea de tiempo de próximos cobros de quincena vs. vencimientos de gastos y cuotas, más corte mensual de Ingresos vs. Gastos reales y tasa de ahorro (%).
- [ ] **Gastos Compartidos Vinculados (_Split / Reembolsos_)**: Opción en gastos recurrentes (ej. suscripciones familiares) para generar o incrementar automáticamente el cobro pendiente en _Cuentas por Cobrar_ al registrar el pago.
- [ ] **Respaldo Unificado (`Unified App Snapshot`)**: Exportar e importar en un único archivo JSON tanto el estado del módulo de Presupuesto como las transacciones y configuraciones del Portafolio Crypto.

---

## 🔜 Fase 4 — Despliegue Web Gratuito, Sync PC–Móvil y PWA

- [ ] Configurar `vite-plugin-pwa` (manifest, iconos y caché offline instalable en Android/iOS).
- [ ] Abstraer persistencia detrás de una interfaz `DataRepository` (modo local vs nube).
- [ ] Esquema PostgreSQL + RLS en Supabase con autenticación de usuario.
- [ ] Guía de deploy gratuito (`DEPLOY.md` en Vercel / Cloudflare Pages).

---

## 🔜 Fase 5 — Onboarding Guiado, Perfiles Regionales y Beta Privada

- [ ] **Asistente de Bienvenida (*Onboarding Wizard* al registrarse):** Flujo inicial paso a paso para evitar abrumar a usuarios nuevos con toda la complejidad de la app desde el primer día:
  - **Selección de país y perfil regional:** Presets listos para **Estados Unidos (`USD`)**, **República Dominicana (`DOP` / `USD`)**, **Venezuela (`USD` / `VES`)** o perfil global personalizado, precargando cuentas base acordes al país y ocultando automáticamente conceptos locales que no apliquen (ej. Bolívares o tasa BCV fuera de Venezuela).
  - **Carga guiada de finanzas base:** Preguntas simples para definir salario/ingreso y frecuencia de cobro (semanal, quincenal o mensual), saldos iniciales por cuenta, gastos fijos principales y meta inicial de fondo de emergencia, dejando el sistema poblado y listo para usar en minutos.
  - **Divulgación progresiva de módulos (*Modo Esencial vs. Completo*):** Permitir elegir qué módulos mostrar al inicio (ej. empezar solo con Presupuesto, Sobres y Gastos, y activar después Portafolio Crypto, Motor Táctico o Suscripciones Compartidas conforme el usuario quiera explorar más).
- [ ] **Motor Multi-Moneda Regional (`USD`, `DOP`, `VES` y extensible):** Formato de moneda base por usuario (`Intl.NumberFormat`), soporte tanto para modo monomoneda limpio (ej. USA en `USD`) como bimoneda opcional con tasa cambiaria (ej. `DOP ↔ USD` en República Dominicana, `VES ↔ USD` en Venezuela).
- [ ] **Acceso Beta Privada:** Flujo simple de registro/invitación para compartir la app en USA y República Dominicana, con opción para reabrir el asistente o ajustar país/moneda en cualquier momento desde configuración.

---

## 🔜 Fase 6 — Integración Binance API (Read-Only) + DCA Automático

- [ ] Proxy Serverless (`/api/binance-sync`) con firma HMAC-SHA256 segura en servidor.
- [ ] Lectura de balances Spot, Simple Earn y trades históricos (`myTrades`).
- [ ] Normalización sin duplicados hacia el módulo DCA y vinculación con Patrimonio Total.

---


## 🔜 Fase 7 — Evolución a SuperApp (Life OS): Rutinas Sociales, Hábitos y Biblioteca

- [ ] **Rutinas Sociales y Gamificación (_Estilo Routinery + Strava_)**: Motor de ejecución de hábitos paso a paso integrado con mecánicas competitivas y validación social entre amigos:
  - **Temporizador secuencial + bloques financieros**: Ejecución cronometrada (mañana, entrenamiento, estudio, cierre) con bloques conectables directamente al módulo de finanzas (ej. _"Registrar gastos del día - 5 min"_, _"Revisar presupuesto semanal - 15 min"_), además de registro de tiempo real vs. planeado y estadísticas de adherencia.
  - **Micro-grupos competitivos, Ligas Semanales y Rachas**: Salas cerradas de amigos con _feed_ minimalista en vivo (ej. _"Juan inició su Rutina de Mañana - 40 min"_), puntaje con reinicio cada lunes (ligas justas entre nuevos y veteranos) y multiplicadores por rachas individuales o grupales.
  - **Sistema de puntos justo y flexible**: Puntaje basado en tiempo real cumplido (no por marcar checkboxes de golpe), verificación opcional con foto rápida (_estilo BeReal_) para puntos extra y modo flexible de ajuste/confirmación retroactiva para evitar penalizaciones cuando el temporizador queda corriendo y se cierran bloques al final.
  - **Privacidad con "Puntos Fantasma"**: Rutinas o tareas marcadas como privadas ocultan su contenido ante el grupo, sumando puntos al ranking bajo una etiqueta genérica (_"Actividad privada completada"_).

  | Subfase                              | Alcance                                                                                                           | Objetivo                                                                   |
  | :----------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
  | **7.1 MVP**                          | Temporizador de rutinas, grupos cerrados, privacidad básica ("Puntos Fantasma") y ranking semanal.                | Validar retención diaria y fricción de uso con un grupo pequeño de prueba. |
  | **7.2 Social y Retención**           | Fotos de verificación opcionales (_BeReal_), ajuste flexible de cierre, rachas grupales y notificaciones en vivo. | Aumentar la presión social positiva y el compromiso semanal.               |
  | **7.3 Sinergia Finanzas & AI Coach** | Bloques financieros nativos, rutinas generadas por IA y alertas cruzadas con presupuesto.                         | Consolidar la transición de app de finanzas a SuperApp de vida.            |

- [ ] **Habit Tracker & Consistencia (_Estilo Streaks / Loop_)**: Seguimiento de hábitos diarios y semanales con rachas (_streaks_), mapa de calor (_heatmap_) y conexión opcional con metas de ahorro/sobres.
- [ ] **Biblioteca y Seguimiento de Lectura (_Estilo Readwise_)**: Gestión de libros (_Por leer_, _Leyendo_, _Terminado_), progreso en páginas/tiempo conectado al bloque de lectura de la rutina y al sobre `Crecimiento Personal`.

---

## 🔜 Fase 8 — Smart Command Bar & AI Life/Wealth Coach

- [ ] **Smart Command Bar Unificada (Lenguaje Natural)**: Parser local determinístico (offline) + integración opcional con LLM (_Structured Outputs_) y vista previa editable antes de confirmar para registrar tanto operaciones financieras encadenadas como avances de rutinas, hábitos o lectura.
- [ ] **Optimizador de Rutinas y Hábitos por IA (Cruce Finanzas ↔ Adherencia)**: Análisis de fricción real (pasos omitidos, horarios de mayor cumplimiento, exceso de duración), generación de rutinas según metas del usuario y correlación cruzada con datos financieros (ej. detectar si abandonar la rutina de mañana correlaciona con más gastos impulsivos o entregas de comida) para proponer ajustes realistas.
- [ ] **Asesor de Portafolio e Inversión por IA**: Recomendaciones de asignación cruzando excedentes de sobres, progreso del `Fondo de Emergencia`, reglas de distribución objetivo del portafolio y precios `Target Buy` / `DCA`.
- [ ] **Recomendador de Libros y Crecimiento Personal**: Sugerencias de lectura y micro-hábitos basadas en objetivos activos, notas de libros leídos y presupuesto disponible en `Crecimiento Personal`.

---

## 🔜 Fase 9 — Empaquetado Móvil (Play Store) y Sostenibilidad

- [ ] Evaluación técnica y de costos: **Capacitor** vs **TWA (Trusted Web Activity)**.
- [ ] Modelo de seguridad **BYOK (Bring Your Own Key)** Read-Only para integraciones de API y IA.
- [ ] Definición de plan gratuito (Local-First) vs Supporter/Pro (`PLAYSTORE_FEASIBILITY.md`).
