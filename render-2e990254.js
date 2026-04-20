const { runRemotionRender } = require('./lib/pipeline/remotion-runner');
runRemotionRender({
  taskId: '2e990254',
  htmlPath: 'public/output/2026-04-20/2e990254/2e990254.html',
  outlinePath: 'public/output/2026-04-20/2e990254/2e990254-outline.md',
  outputDir: 'public/output/2026-04-20/2e990254/',
  dimensions: { width: 1080, height: 1920 },
  videoStyle: 'normal',
  onProgress: (msg) => console.log(msg),
}).then(r => console.log('Done:', r)).catch(e => console.error(e));