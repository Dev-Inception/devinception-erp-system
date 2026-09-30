/**
 * Turns a full HTML document (e.g. the INVOICE_A4 template from printing.ts)
 * into an A4 PDF, so what a customer receives on WhatsApp is the exact
 * invoice staff would print. The page is laid out in an offscreen iframe at
 * A4 width, rasterised with html2canvas, and sliced across as many A4 pages
 * as it needs. Both libraries are loaded on demand — they're only needed
 * when someone actually sends a document.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 10;
// A4's printable width at 96 CSS px per inch, so the template lays out the
// same way it does in the print preview.
const RENDER_WIDTH_PX = Math.round(((A4_WIDTH_MM - 2 * MARGIN_MM) / 25.4) * 96);

export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${RENDER_WIDTH_PX}px`,
    height: '1000px',
    border: '0',
  });
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    // Wait for the logo and any other images before capturing.
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = img.onerror = resolve;
            }),
      ),
    );
    await doc.fonts?.ready;
    // Grow the frame to the full document so nothing is clipped.
    iframe.style.height = `${doc.documentElement.scrollHeight}px`;

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      backgroundColor: '#ffffff',
      width: RENDER_WIDTH_PX,
      windowWidth: RENDER_WIDTH_PX,
      logging: false,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const contentWidthMm = A4_WIDTH_MM - 2 * MARGIN_MM;
    const contentHeightMm = A4_HEIGHT_MM - 2 * MARGIN_MM;
    // Canvas pixels that fit on one page at the content width.
    const pageHeightPx = Math.floor((canvas.width * contentHeightMm) / contentWidthMm);

    for (let y = 0, page = 0; y < canvas.height; y += pageHeightPx, page++) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      slice.getContext('2d')!.drawImage(canvas, 0, -y);
      if (page > 0) pdf.addPage();
      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        MARGIN_MM,
        MARGIN_MM,
        contentWidthMm,
        (sliceHeight * contentWidthMm) / canvas.width,
      );
    }
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}
