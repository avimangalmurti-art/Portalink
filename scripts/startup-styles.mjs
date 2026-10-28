/** Only the branded main entry has critical inline artwork before app CSS. */
export function deferMainStartupStyles(html, emittedCss) {
  const assets = new Set(emittedCss);
  return html.replace(/<link\b[^>]*>/gi, tag => {
    const attribute = name => tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
    const href = attribute('href');
    if (attribute('rel') !== 'stylesheet' || !href || /^(?:[a-z]+:)?\/\//i.test(href)
      || attribute('media') || /\bdata-portalink-app-style\b/i.test(tag)) return tag;
    const asset = href.split(/[?#]/)[0].replace(/^(?:\.\/|\/)/, '');
    if (!assets.has(asset)) return tag;
    return tag.replace(/\s*\/?>(?=$)/, ' media="print" data-portalink-app-style="" onload="this.media=\'all\';this.dataset.portalinkStyleStatus=\'ready\'" onerror="this.dataset.portalinkStyleStatus=\'error\'">');
  });
}

export function startupStylesPlugin() {
  return {
    name: 'portalink-main-startup-styles',
    apply: 'build',
    enforce: 'post',
    // Run after Vite emits the final HTML and its static-import CSS links.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const main = bundle['index.html'];
        if (!main || main.type !== 'asset') return;
        const css = Object.values(bundle).filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.fileName);
        main.source = deferMainStartupStyles(String(main.source), css);
      },
    },
  };
}
