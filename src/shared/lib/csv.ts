import Papa from 'papaparse';
import type { Transaction } from '../types';

interface CsvRow {
  Date: string;
  Type: string;
  Asset: string;
  Tokens: string;
  USD_Value: string;
}

/**
 * Parse a CSV file (uploaded by user) into typed Transaction[].
 * Expects headers: Date, Type, Asset, Tokens, USD_Value
 */
export function parseCsvFile(file: File): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const transactions: Transaction[] = results.data.map((row) => ({
          date: row.Date?.trim() ?? '',
          type: row.Type?.trim() as Transaction['type'],
          asset: row.Asset?.trim() ?? '',
          tokens: row.Tokens?.trim() ?? '0',
          usdValue: parseFloat(row.USD_Value) || 0,
        }));
        resolve(transactions);
      },
      error(err: Error) {
        reject(err);
      },
    });
  });
}

/**
 * Parse raw CSV text into Transaction[].
 */
export function parseCsvText(csvText: string): Transaction[] {
  const results = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return results.data.map((row) => ({
    date: row.Date?.trim() ?? '',
    type: row.Type?.trim() as Transaction['type'],
    asset: row.Asset?.trim() ?? '',
    tokens: row.Tokens?.trim() ?? '0',
    usdValue: parseFloat(row.USD_Value) || 0,
  }));
}

/**
 * Serialize Transaction[] back to CSV and trigger a browser download.
 */
export function exportCsv(transactions: Transaction[]): void {
  const rows = transactions.map((tx) => ({
    Date: tx.date,
    Type: tx.type,
    Asset: tx.asset,
    Tokens: tx.tokens,
    USD_Value: tx.usdValue,
  }));

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Format a token number to string preserving precision (min 2 decimals).
 * Ported from Python _format_token_str().
 */
export function formatTokenStr(value: number): string {
  const s = value.toString();
  if (!s.includes('.')) return s + '.00';
  const frac = s.split('.')[1];
  if (frac.length === 1) return s + '0';
  return s;
}
