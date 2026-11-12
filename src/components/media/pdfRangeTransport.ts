import type { PdfRangeSource } from '../../types/domain';
import type { PdfJs } from './PdfPage';

/** Give PDF.js just the requested bytes without downloading the entire file. */
export function pdfRangeOptions(pdfjs: PdfJs, source: PdfRangeSource, onFailure: (error: unknown) => void) {
  const controller = new AbortController();

  class MultipartPdfTransport extends pdfjs.PDFDataRangeTransport {
    override requestDataRange(begin: number, end: number) {
      void source.read(begin, end, controller.signal).then(data => {
        if (!controller.signal.aborted) this.onDataRange(begin, data);
      }).catch(error => {
        if (controller.signal.aborted) return;
        controller.abort();
        onFailure(error);
      });
    }

    override abort() {
      controller.abort();
    }
  }

  return {
    range: new MultipartPdfTransport(source.length, null, true),
    disableAutoFetch: true,
    disableStream: true,
    rangeChunkSize: 1024 * 1024,
  };
}
