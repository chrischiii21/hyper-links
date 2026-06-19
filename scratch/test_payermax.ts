import { extractLinks } from '../src/lib/linkUtils.ts';

const test1 = `Sources: (Source: PayerMax, 2026, https://www.payermax.com/about/company) (Source: PR Newswire, 2024, https://www.prnewswire.com/apac/news-releases/payermax-makes-a-strong-debut-at-g-star-korea-championing-seamless-global-payment-solutions-for-the-gaming-industry-302306915.html) (Source: PayerMax Newsroom, 2024, https://www.payermax.com/article/news/tgoh9akizykxkm9srfl9qpva) (Source: AWS Case Study, 2025, https://aws.amazon.com/solutions/case-studies/payermax/)`;

const test2 = `Integrated Medical Systems website (integratedmedsys.com/about, integratedmedsys.com/asset-management-software, integratedmedsys.com/biomedical-services); LinkedIn Company Page (linkedin.com/company/integrated-medical-systems-inc); IMS 30-Year Anniversary Press Release (integratedmedsys.com/news/post/integrated-medical-systems-inc-celebrates-30-years-of-success-and-innovation, 2024).`;

console.log("Test 1:");
console.log(JSON.stringify(extractLinks(test1), null, 2));

console.log("\nTest 2:");
console.log(JSON.stringify(extractLinks(test2), null, 2));
