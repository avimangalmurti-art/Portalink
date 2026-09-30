/** Minimal PDF 1.4 assembler for our own RGB JPEG canvases. No source PDF parsing. */
export type JpegPdfPage = {jpeg: Blob; pixelWidth: number; pixelHeight: number; width: number; height: number};
const ascii = (value: string) => new TextEncoder().encode(value);
export function assembleJpegPdf(pages: JpegPdfPage[], liveUrl: string): Blob {
  if (!pages.length || pages.length > 120) throw new Error('Choose between 1 and 120 pages.');
  if (!/^https?:\/\//.test(liveUrl)) throw new Error('The portfolio address is invalid.');
  const chunks: BlobPart[] = [ascii('%PDF-1.4\n%Portalink\n')], offsets = [0];
  let length = (chunks[0] as Uint8Array).byteLength;
  const append = (value: Uint8Array<ArrayBuffer> | Blob) => {chunks.push(value);length += value instanceof Blob ? value.size : value.byteLength;};
  const object = (id: number, parts: (Uint8Array<ArrayBuffer> | Blob)[]) => {
    offsets[id] = length; append(ascii(`${id} 0 obj\n`));parts.forEach(append);append(ascii('\nendobj\n'));
  };
  const pageIds = pages.map((_,index) => 3 + index * 3), linkId = 3 + pages.length * 3;
  object(1,[ascii('<< /Type /Catalog /Pages 2 0 R >>')]);
  object(2,[ascii(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`)]);
  pages.forEach((page,index) => {
    if (![page.width,page.height,page.pixelWidth,page.pixelHeight].every(value=>Number.isFinite(value)&&value>0&&value<=20000) || page.jpeg.type !== 'image/jpeg') throw new Error('A PDF page image is invalid.');
    const id=pageIds[index], imageId=id+1, contentId=id+2;
    object(id,[ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im ${imageId} 0 R >> >> /Contents ${contentId} 0 R${index===0?` /Annots [${linkId} 0 R]`:''} >>`)]);
    object(imageId,[ascii(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.size} >>\nstream\n`),page.jpeg,ascii('\nendstream')]);
    const content=ascii(`q ${page.width} 0 0 ${page.height} 0 0 cm /Im Do Q\n`);
    object(contentId,[ascii(`<< /Length ${content.byteLength} >>\nstream\n`),content,ascii('endstream')]);
  });
  const escaped=encodeURI(liveUrl).replace(/[\\()]/g,'\\$&');
  object(linkId,[ascii(`<< /Type /Annot /Subtype /Link /Rect [36 36 ${pages[0].width-36} 140] /Border [0 0 0] /A << /S /URI /URI (${escaped}) >> >>`)]);
  const xref=length;
  append(ascii(`xref\n0 ${linkId+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${linkId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(chunks,{type:'application/pdf'});
}
