import { extractLinks } from '../src/lib/linkUtils.ts';

const testInput = `Integrated Medical Systems website (integratedmedsys.com/about, integratedmedsys.com/asset-management-software, integratedmedsys.com/biomedical-services); LinkedIn Company Page (linkedin.com/company/integrated-medical-systems-inc); IMS 30-Year Anniversary Press Release (integratedmedsys.com/news/post/integrated-medical-systems-inc-celebrates-30-years-of-success-and-innovation, 2024).`;

console.log("Input:", testInput);
console.log("Extracted links:\n", JSON.stringify(extractLinks(testInput), null, 2));
