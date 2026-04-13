import type { LivePrices } from '../types';
import { getApiKey } from '../../../shared/lib/storage';

const BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * Fetch live USD prices for a batch of CoinGecko coin IDs.
 * Handles rate limiting with exponential backoff and CORS errors gracefully.
 */
export async function fetchLivePrices(coinIds: string[]): Promise<LivePrices> {
  if (coinIds.length === 0) return {};

  const idsStr = coinIds.join(',');
  const apiKey = getApiKey();

  const url = apiKey
    ? `${BASE_URL}/simple/price?ids=${idsStr}&vs_currencies=usd&x_cg_demo_api_key=${apiKey}`
    : `${BASE_URL}/simple/price?ids=${idsStr}&vs_currencies=usd`;

  let lastError: Error | null = null;

  // Retry up to 3 times with exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 429) {
        // Rate limited — wait and retry
        const waitMs = Math.pow(2, attempt) * 1000;
        console.warn(`CoinGecko rate limited. Retrying in ${waitMs}ms...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as LivePrices;
    } catch (err) {
      lastError = err as Error;

      // CORS errors appear as TypeError in fetch
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        console.error('CORS or network error fetching CoinGecko prices. Returning empty.');
        return {};
      }

      // Other errors — retry
      const waitMs = Math.pow(2, attempt) * 500;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  console.error('CoinGecko fetch failed after 3 attempts:', lastError?.message);
  return {};
}
