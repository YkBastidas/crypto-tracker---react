# 📊 Master Finance Web App — Phase 1: Crypto Tracker

Una aplicación web moderna, rápida y **Local-First** para gestionar tu portafolio de criptomonedas y fiat sin comprometer tu privacidad.

⚠️ **Importante**: Esta es una aplicación en desarrollo. Puedes usarla para llevar un registro de tus finanzas personales. Se recomienda tener un respaldo de tu información ya que futuras actualizaciones pueden romper la compatibilidad con versiones anteriores.

> **🔒Privacidad Total**: Tus datos nunca salen de tu navegador. Esta app procesa los archivos CSV de forma local y guarda tus configuraciones en el almacenamiento del navegador (`localStorage`).

---

## 🚀 Características Principales

- **Gestión de Portafolio Local**: Sube tu archivo `portfolio.csv` y visualiza tus activos al instante.
- **Cálculo Automático de DCA**: Entiende tu precio promedio de compra real después de múltiples operaciones.
- **Sistema de Dual Targets**: Define porcentajes de "Target Buy" y "Target Sell" personalizados por moneda para planificar tus próximas órdenes en el exchange.
- **Privacidad con un clic**: Modo incógnito integrado para ocultar tus balances sensibles.
- **Diseño Sleek Dark**: Interfaz optimizada (estilo Exchange Pro) con Tailwind CSS.

---

## 📸 Screenshots

![Investments & DCA Overview](https://raw.githubusercontent.com/YkBastidas/crypto-tracker---react/refs/heads/main/src/assets/screenshot-investments-1.png)
_Detalle de las tarjetas de activos con indicadores de compra/venta y configuración de objetivos._

![Global Portfolio](https://raw.githubusercontent.com/YkBastidas/crypto-tracker---react/refs/heads/main/src/assets/screenshot-globalportfolio-1.png)
_Vista general del dashboard con balances globales, progreso de metas e histórico de transacciones._

---

## 🛠️ Tech Stack

- **Framework**: React 18 + Vite
- **Arquitectura**: Feature-Sliced Design (FSD) para escalabilidad.
- **Estado**: Zustand (Estado global ligero).
- **Estilos**: Tailwind CSS.
- **Parsing**: PapaParse (Procesamiento de CSV).

---

## 🏁 Roadmap

- [x] **Fase 1**: Tracker de Cripto y Fiat funcional (Local-First).
- [ ] **Fase 2**: Integración de Finanzas Personales (Presupuestos, Gastos Diarios).
- [ ] **Fase 3**: Sincronización opcional en la nube (Supabase) y cuentas de usuario.

---

## 💻 Instalación y Uso

1. Clona el repositorio:
   ```bash
   git clone https://github.com/YkBastidas/crypto-tracker---react.git
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Abre la aplicación en tu navegador:
   ```bash
   http://localhost:5173
   ```

Para usar la app, simplemente sube un archivo .csv siguiendo el formato de la plantilla incluida en este repositorio.

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si tienes ideas para la Fase 2 o mejoras en la UI, siéntete libre de abrir un Pull Request o un Issue.

## 📜 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo LICENSE para más detalles.

## ☕ Apoya el Proyecto / Support

Si esta herramienta te ayuda a organizar tus finanzas, considera apoyar su desarrollo continuo:

USDT (Network: TRC20): TVgEUS7cyCwfNSeEiDyGgconFXsXMUFWi3
