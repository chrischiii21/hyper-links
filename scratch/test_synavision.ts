import { extractLinks } from '../src/lib/linkUtils';

const inputStr = `Sources: Synavision CB Insights profile, https://www.cbinsights.com/company/synavision | Synavision AMEV 178 press release, https://www.synavision.de/en/news-posts/ | Synavision ai.lab, https://www.synavision.de/en/ailab/ | MarketDataForecast (Europe Energy Management Systems Market, 2024), https://www.marketdataforecast.com/market-reports/europe-energy-management-systems-market`;

console.log("Input:", inputStr);
const res = extractLinks(inputStr);
console.log("Extracted links:", JSON.stringify(res, null, 2));
