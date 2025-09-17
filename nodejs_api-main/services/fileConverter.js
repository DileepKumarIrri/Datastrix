
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Converts a DOCX file to a PDF file.
 * The new PDF will be saved in the same directory with the same base name.
 * The original DOCX file is deleted after successful conversion.
 * @param {string} docxPath The absolute path to the DOCX file.
 * @returns {Promise<string>} A promise that resolves with the path to the newly created PDF file.
 */
const convertDocxToPdf = async (docxPath) => {
    try {
        console.log(`Starting conversion for: ${docxPath}`);
        
        // 1. Convert DOCX to HTML using Mammoth
        const { value: html } = await mammoth.convertToHtml({ path: docxPath });
        console.log('DOCX converted to HTML.');

        // 2. Use Puppeteer to "print" the HTML to a PDF
        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        
        // Setting content and waiting for it to be fully loaded
        await page.setContent(html, { waitUntil: 'networkidle0' });
        console.log('HTML content set in Puppeteer page.');

        // Define the output path for the PDF
        const pdfPath = docxPath.replace(/\.docx$/, '.pdf');
        
        // Generate PDF
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '1in',
                right: '1in',
                bottom: '1in',
                left: '1in',
            },
        });
        console.log(`PDF generated at: ${pdfPath}`);
        
        await browser.close();
        console.log('Puppeteer browser closed.');

        // 3. Delete the original DOCX file
        fs.unlink(docxPath, (err) => {
            if (err) {
                console.error(`Failed to delete original DOCX file: ${docxPath}`, err);
            } else {
                console.log(`Successfully deleted original DOCX file: ${docxPath}`);
            }
        });

        return pdfPath;
    } catch (error) {
        console.error('An error occurred during DOCX to PDF conversion:', error);
        // If conversion fails, attempt to delete the temporary DOCX file to avoid orphans
        if (fs.existsSync(docxPath)) {
            fs.unlinkSync(docxPath);
        }
        throw new Error('Failed to convert DOCX to PDF.');
    }
};

module.exports = {
    convertDocxToPdf,
};
