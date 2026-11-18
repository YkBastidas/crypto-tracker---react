# 🗺️ Roadmap — Master Finance Web App

> Documento público del proyecto. Se mantiene libre de datos personales, montos reales o credenciales (toda información privada permanece en `private_docs/`, ignorado por Git).

---

## ✅ Fase 1 — Portafolio Crypto (DCA) *(Completada)*
- [x] Carga y exportación local de transacciones vía CSV (`PapaParse`).
- [x] Cálculo automático de precio promedio de compra (DCA) y P&L.
- [x] Sistema de metas duales (`Target Buy` / `Target Sell`) por moneda.
- [x] Integración de precios en vivo con CoinGecko y modo privacidad (`PrivacyValue`).

---

## ✅ Fase 2 — Motor Quincenal, Sobres y Gastos *(Completada)*
- [x] Arquitectura modular multi-vista Mobile-First (Bottom Nav en móvil, Sidebar en desktop).
- [x] Store persistente en `localStorage` con exportar/importar respaldo JSON.
- [x] **Resumen (Dashboard)**: Patrimonio consolidado en fondos operativos/reserva, cuentas personalizadas (`USD` / `VES`) con CRUD completo y desglose por custodia (`Efectivo`, `USDT`, `Bs`).
- [x] **Meta del Fondo de Emergencia**: Configurable por *X meses de gastos indispensables* o monto personalizado.
- [x] **Tasa BCV diaria**: Integración automática con `ve.dolarapi.com` + soporte manual offline.
- [x] **Registrar Quincena (Wizard)**: Reglas configurables (`%` o `$ fijo`), provisión automática de gastos mensuales y **Sinking Fund (`Provisiones Anuales`)**.
- [x] **Gastos y Cuentas por Cobrar/Pagar**: Días restantes, prorrateo quincenal, abonos variables, alertas en Dashboard, forma de pago más común por gasto y botón **Deshacer**.
- [x] **Cambio de Custodia Multi-Sobre**: Conversión en una sola operación (ej. USDT ↔ Efectivo ↔ Bolívares) repartida entre múltiples sobres con sugerencia automática según la forma de pago preferida de cada gasto.
- [x] **Motor de Cierre Mensual (Rollover & Sweep)**: Simulación previa con protección de gastos cercanos, fondeo de déficit anual y barridos internos (`SWEEP` / `ROLLOVER`).
- [x] **Guía Rápida ("Cómo usar")**: Buscador local por palabras clave y sinónimos.

---

## 🔜 Fase 3 — Despliegue Web Gratuito, Sync PC–Móvil y PWA
- [ ] Configurar `vite-plugin-pwa` (manifest, iconos y caché offline instalable en Android/iOS).
- [ ] Abstraer persistencia detrás de una interfaz `DataRepository` (modo local vs nube).
- [ ] Esquema PostgreSQL + RLS en Supabase con autenticación de usuario.
- [ ] Guía de deploy gratuito (`DEPLOY.md` en Vercel / Cloudflare Pages).

---

## 🔜 Fase 4 — Integración Binance API (Read-Only) + DCA Automático
- [ ] Proxy Serverless (`/api/binance-sync`) con firma HMAC-SHA256 segura en servidor.
- [ ] Lectura de balances Spot, Simple Earn y trades históricos (`myTrades`).
- [ ] Normalización sin duplicados hacia el módulo DCA y vinculación con Patrimonio Total.

---

## 🔜 Fase 5 — Smart Command Bar (Lenguaje Natural)
- [ ] Parser local determinístico para comandos rápidos offline (monto, moneda, sobre).
- [ ] Integración opcional con LLM (*Structured Outputs* / *Function Calling*) para operaciones encadenadas de múltiples pasos.
- [ ] Vista previa editable paso a paso antes de confirmar movimientos en el ledger.

---

## 🔜 Fase 6 — Empaquetado Móvil (Play Store) y Sostenibilidad
- [ ] Evaluación técnica y de costos: **Capacitor** vs **TWA (Trusted Web Activity)**.
- [ ] Modelo de seguridad **BYOK (Bring Your Own Key)** Read-Only para usuarios externos.
- [ ] Definición de plan gratuito (Local-First) vs Supporter/Pro (`PLAYSTORE_FEASIBILITY.md`).
