// MT5 quote provider — delegates to server/services/mt5-api.js.
// Falls back to the mock generator while MT5 credentials are not configured,
// so the endpoint keeps working end-to-end.
import { getMt5Quotes, isMt5Configured } from '../mt5-api.js';
import { MockQuoteProvider } from './mock.js';

const fallback = new MockQuoteProvider();

export class Mt5QuoteProvider {
  async getQuotes() {
    if (!isMt5Configured()) {
      return fallback.getQuotes();
    }
    return getMt5Quotes();
  }
}
