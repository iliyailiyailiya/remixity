import { defineConfig, loadEnv } from 'vite';

// ads.txt (recommended by AdSense) is generated from the publisher ID, so it
// only exists once ads are switched on.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Modern output (Safari 15+): no down-levelled class fields. That matters
    // for Signalsmith Stretch, which ships part of its own code to the audio
    // thread as text, where helpers like __publicField don't exist.
    build: { target: 'es2022' },
    esbuild: { target: 'es2022' },
    optimizeDeps: { exclude: ['signalsmith-stretch'], esbuildOptions: { target: 'es2022' } },
    plugins: [
      {
        // With a publisher ID, the page carries AdSense's code in its HTML
        // (how Google checks the site during review) and its account meta tag.
        name: 'adsense-head',
        transformIndexHtml(html) {
          const client = env.VITE_ADSENSE_CLIENT;
          if (!client) return html;
          return html.replace(
            '</head>',
            `    <meta name="google-adsense-account" content="${client}" />\n` +
              `    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>\n  </head>`,
          );
        },
      },
      {
        name: 'ads-txt',
        generateBundle() {
          const client = env.VITE_ADSENSE_CLIENT;
          if (!client) return;
          const pub = client.replace(/^ca-/, '');
          this.emitFile({
            type: 'asset',
            fileName: 'ads.txt',
            source: `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`,
          });
        },
      },
    ],
  };
});
