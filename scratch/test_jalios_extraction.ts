import { extractLinks } from '../src/lib/linkUtils';

const testCases = [
  {
    input: "Jalios clients page (jalios.com/fr/clients/)",
    expected: [{ publisher: "Jalios - Clients", url: "https://jalios.com/fr/clients/" }]
  },
  {
    input: "Jalios homepage (jalios.com/fr/)",
    expected: [{ publisher: "Jalios - Homepage", url: "https://jalios.com/fr/" }]
  },
  {
    input: "Jalios sectors pages (jalios.com/fr/solutions/secteurs/)",
    expected: [{ publisher: "Jalios - Sectors", url: "https://jalios.com/fr/solutions/secteurs/" }]
  },
  {
    input: "Frotcom company website (https://www.frotcom.com/frotcom-international)",
    expected: [{ publisher: "Frotcom - Company Website", url: "https://www.frotcom.com/frotcom-international" }]
  },
  {
    input: "Some random text with no description: jalios.com/fr/solutions/secteurs/",
    expected: [{ publisher: "Jalios - Sectors", url: "https://jalios.com/fr/solutions/secteurs/" }]
  },
  {
    input: "Naked URL: jalios.com/fr/clients/",
    expected: [{ publisher: "Jalios - Clients", url: "https://jalios.com/fr/clients/" }]
  },
  {
    input: "Naked homepage URL: jalios.com/fr/",
    expected: [{ publisher: "Jalios - Homepage", url: "https://jalios.com/fr/" }]
  }
];

let failed = false;
for (const tc of testCases) {
  const result = extractLinks(tc.input);
  console.log(`\nInput: "${tc.input}"`);
  console.log(`Extracted: ${JSON.stringify(result)}`);
  
  if (result.length !== tc.expected.length) {
    console.error(`FAIL: expected ${tc.expected.length} results, got ${result.length}`);
    failed = true;
    continue;
  }
  
  for (let i = 0; i < result.length; i++) {
    const res = result[i];
    const exp = tc.expected[i];
    if (res.publisher !== exp.publisher || res.url !== exp.url) {
      console.error(`FAIL: expected ${JSON.stringify(exp)}, got ${JSON.stringify(res)}`);
      failed = true;
    } else {
      console.log(`PASS: ${res.publisher} (${res.url})`);
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("\nALL TESTS PASSED!");
  process.exit(0);
}
