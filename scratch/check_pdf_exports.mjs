import { PDFParse } from 'pdf-parse';
console.log('Type of PDFParse:', typeof PDFParse);

async function run() {
    try {
        // Based on the library description, it might be a class or a static method.
        // Let's try to see if it has a static method like 'fromBuffer' or if it's a function.
        if (typeof PDFParse === 'function') {
            console.log('PDFParse is a function/constructor');
            const parser = new PDFParse();
            console.log('Parser keys:', Object.keys(parser));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
