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

export interface DualRatesResult {
  bcvRate: number;
  bcvUpdatedAt: string;
  parallelRate: number | null;
  parallelUpdatedAt: string | null;
}

const BCV_ENDPOINT = 'https://ve.dolarapi.com/v1/cotizaciones';
const DOLARES_ENDPOINT = 'https://ve.dolarapi.com/v1/dolares';

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

export async function fetchDualUsdRates(): Promise<DualRatesResult> {
  try {
    const response = await fetch(DOLARES_ENDPOINT);
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }
    const data = (await response.json()) as BcvQuoteResponse[];
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Respuesta inesperada de DolarApi');
    }

    const official = data.find(
      (item) =>
        item.fuente?.toLowerCase() === 'oficial' ||
        item.nombre?.toLowerCase().includes('oficial'),
    );
    const parallel = data.find(
      (item) =>
        item.fuente?.toLowerCase() === 'paralelo' ||
        item.nombre?.toLowerCase().includes('paralelo'),
    );

    const bcvRate = Number(official?.promedio || official?.venta || official?.compra || 0);
    if (!Number.isFinite(bcvRate) || bcvRate <= 0) {
      throw new Error('Tasa BCV no encontrada en /dolares');
    }

    const rawParallel = Number(parallel?.promedio || parallel?.venta || parallel?.compra || 0);
    const parallelRate = Number.isFinite(rawParallel) && rawParallel > 0 ? rawParallel : null;

    return {
      bcvRate,
      bcvUpdatedAt: official?.fechaActualizacion || new Date().toISOString(),
      parallelRate,
      parallelUpdatedAt: parallelRate
        ? parallel?.fechaActualizacion || new Date().toISOString()
        : null,
    };
  } catch {
    const bcv = await fetchBcvUsdRate();
    return {
      bcvRate: bcv.rate,
      bcvUpdatedAt: bcv.updatedAt,
      parallelRate: null,
      parallelUpdatedAt: null,
    };
  }
}
