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
- [x] **Motor de Compra Escalonada (_Smart Dip-Buying_) y Alertas Globales**: Cálculo exacto de compra para punto de equilibrio DCA, matriz táctica en 3 niveles (8–12%, 12–18%, >18%) restringida al capital elegible (`Ahorro e Inversión` + `USDT libre`) con reserva residual, toma parcial de ganancias y campanita de oportunidades en el Header.
- [x] **Organización de Portafolio y Cierre de Posiciones**: Separación de Activos Crypto vs. Stablecoins, ordenamiento dinámico y manual (_drag & drop_ / flechas persistentes) y archivo de monedas cerradas en un _Histórico de Profit Realizado_.
- [ ] **Motor Dual-Rate (BCV + Paralelo/USDT) e IGTF (+3%)**: Soporte opcional para doble tasa cambiaria (calculando el ahorro/ganancia por brecha cambiaria al cubrir gastos a tasa oficial con USDT/Bs) y botón rápido de `+3% IGTF` para pagos en divisas. Configurable según perfil regional (Venezuela / Global).
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

## 🔜 Fase 5 — Integración Binance API (Read-Only) + DCA Automático

- [ ] Proxy Serverless (`/api/binance-sync`) con firma HMAC-SHA256 segura en servidor.
- [ ] Lectura de balances Spot, Simple Earn y trades históricos (`myTrades`).
- [ ] Normalización sin duplicados hacia el módulo DCA y vinculación con Patrimonio Total.

---

## 🔜 Fase 6 — Evolución a SuperApp (Life OS): Rutinas, Hábitos y Biblioteca

- [ ] **Rutinas Interactivas y Bloques de Tiempo (_Estilo Routinery_)**: Temporizador secuencial paso a paso (rutina de mañana, bloques de enfoque, cierre del día) con registro de tiempo real vs. planeado y estadísticas de adherencia.
- [ ] **Habit Tracker & Consistencia (_Estilo Streaks / Loop_)**: Seguimiento de hábitos diarios y semanales con rachas (_streaks_), mapa de calor (_heatmap_) y conexión opcional con metas de ahorro/sobres.
- [ ] **Biblioteca y Seguimiento de Lectura (_Estilo Readwise_)**: Gestión de libros (_Por leer_, _Leyendo_, _Terminado_), progreso en páginas/tiempo conectado al bloque de lectura de la rutina y al sobre `Crecimiento Personal`.

---

## 🔜 Fase 7 — Smart Command Bar & AI Life/Wealth Coach

- [ ] **Smart Command Bar Unificada (Lenguaje Natural)**: Parser local determinístico (offline) + integración opcional con LLM (_Structured Outputs_) y vista previa editable antes de confirmar para registrar tanto operaciones financieras encadenadas como avances de rutinas, hábitos o lectura.
- [ ] **Optimizador de Rutinas y Hábitos por IA**: Análisis de fricción real (pasos omitidos, horarios de mayor cumplimiento, exceso de duración) para proponer ajustes concretos a las rutinas diarias.
- [ ] **Asesor de Portafolio e Inversión por IA**: Recomendaciones de asignación cruzando excedentes de sobres, progreso del `Fondo de Emergencia`, reglas de distribución objetivo del portafolio y precios `Target Buy` / `DCA`.
- [ ] **Recomendador de Libros y Crecimiento Personal**: Sugerencias de lectura y micro-hábitos basadas en objetivos activos, notas de libros leídos y presupuesto disponible en `Crecimiento Personal`.

---

## 🔜 Fase 8 — Empaquetado Móvil (Play Store), Perfiles Globales y Sostenibilidad

- [ ] Evaluación técnica y de costos: **Capacitor** vs **TWA (Trusted Web Activity)**.
- [ ] Configuración de **Perfil Regional / Multi-Moneda Global** (moneda base seleccionable y activación opcional de módulos locales como doble tasa / IGTF).
- [ ] Modelo de seguridad **BYOK (Bring Your Own Key)** Read-Only para integraciones de API y IA.
- [ ] Definición de plan gratuito (Local-First) vs Supporter/Pro (`PLAYSTORE_FEASIBILITY.md`).
