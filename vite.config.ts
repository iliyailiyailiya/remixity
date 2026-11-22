import { defineConfig, loadEnv } from 'vite';

// ads.txt (recommended by AdSense) is generated from the publisher ID, so it
// only exists once ads are switched on.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
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
