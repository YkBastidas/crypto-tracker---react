export interface BcvQuoteResponse {
  fuente: string;
  nombre: string;
  moneda: string;
  compra: number | null;
  venta: number | null;
  promedio: number | null;
  fechaActualizacion: string;
}

export interface BcvRateResult {
  rate: number;
  updatedAt: string;
}

const BCV_ENDPOINT = 'https://ve.dolarapi.com/v1/cotizaciones';

export async function fetchBcvUsdRate(): Promise<BcvRateResult> {
  const response = await fetch(BCV_ENDPOINT);
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al consultar tasa BCV`);
  }

  const data = (await response.json()) as BcvQuoteResponse[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Respuesta inesperada de DolarApi');
  }

  const usdOfficial =
    data.find(
      (item) =>
        item.moneda?.toUpperCase() === 'USD' &&
        (item.fuente?.toLowerCase() === 'oficial' ||
          item.nombre?.toLowerCase().includes('oficial')),
    ) ?? data.find((item) => item.moneda?.toUpperCase() === 'USD');

  if (!usdOfficial) {
    throw new Error('No se encontró la cotización USD BCV');
  }

  const rate = Number(usdOfficial.promedio || usdOfficial.venta || usdOfficial.compra || 0);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Tasa BCV inválida');
  }

  return {
    rate,
    updatedAt: usdOfficial.fechaActualizacion || new Date().toISOString(),
  };
}
