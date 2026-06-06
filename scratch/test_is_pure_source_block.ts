import { extractLinks, isPureSourceBlock } from '../src/lib/linkUtils.ts';

const testCases = [
  {
    name: "Pure URL",
    text: "https://climate.ai",
    expected: true
  },
  {
    name: "Pure source block (bullet)",
    text: "• ClimateAI: https://climate.ai",
    expected: true
  },
  {
    name: "Pure source block (bullet + hyphen)",
    text: "- ClimateAI - https://climate.ai",
    expected: true
  },
  {
    name: "Source prefix with short text",
    text: "Source: ClimateAI, 2024, https://climate.ai/decision-accuracy/",
    expected: true
  },
  {
    name: "Sources prefix with listing",
    text: "Sources: ClimateAI (https://climate.ai/decision-accuracy/)",
    expected: true
  },
  {
    name: "Narrative paragraph under 300 chars (Customer ROI)",
    text: "ClimateAI’s decision accuracy page states that its 6-month outlooks have been validated as 50–60% more accurate than historical baseline data (Source: ClimateAI, 2024, https://climate.ai/decision-accuracy/). No independently verified customer ROI figure has been publicly disclosed.",
    expected: false
  },
  {
    name: "Short narrative sentence with inline link",
    text: "We partner with ClimateAI (https://climate.ai) to deliver accurate weather forecasting.",
    expected: false
  },
  {
    name: "Short bullet point with inline link",
    text: "- Dole uses ClimateLens (https://climate.ai) for supply chain monitoring.",
    expected: false
  }
];

let failed = false;

testCases.forEach(tc => {
  const links = extractLinks(tc.text);
  const result = isPureSourceBlock(tc.text, links);
  
  if (result === tc.expected) {
    console.log(`✅ [PASS] ${tc.name}`);
  } else {
    console.error(`❌ [FAIL] ${tc.name}`);
    console.error(`   Text: "${tc.text}"`);
    console.error(`   Links:`, links);
    console.error(`   Got: ${result}, Expected: ${tc.expected}`);
    failed = true;
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log("\nAll tests passed successfully!");
}
