import { extractLinks } from '../src/lib/linkUtils.ts';

const testCases = [
  'Source: Website, synavision.de',
  'Source: Website, example.fr',
  'Source: Website, company.tech'
];

testCases.forEach(testInput => {
  console.log("Input:", testInput);
  console.log("Output:", JSON.stringify(extractLinks(testInput), null, 2));
  console.log("-".repeat(40));
});
