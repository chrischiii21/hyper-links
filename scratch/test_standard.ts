import { extractLinks } from '../src/lib/linkUtils.ts';

const cases = [
  "• ClimateAI: https://climate.ai",
  "Source: ClimateAI, 2024, https://climate.ai/decision-accuracy/",
  "Sources: ClimateAI (https://climate.ai/decision-accuracy/)",
  "We partner with ClimateAI (https://climate.ai) to deliver accurate weather forecasting.",
  "- Dole uses ClimateLens (https://climate.ai) for supply chain monitoring.",
  "MarketDataForecast (Europe Energy Management Systems Market, 2024), https://www.marketdataforecast.com/market-reports/europe-energy-management-systems-market"
];

cases.forEach(c => {
  console.log(`\nText: "${c}"`);
  console.log("Extracted:", JSON.stringify(extractLinks(c), null, 2));
});
